package com.ghostapi

import android.content.Context
import android.content.Intent
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import java.io.BufferedInputStream
import java.io.File
import java.io.FileInputStream
import java.io.FileOutputStream
import java.net.HttpURLConnection
import java.net.NetworkInterface
import java.net.URL
import java.util.Collections
import java.util.zip.ZipEntry
import java.util.zip.ZipInputStream
import kotlin.concurrent.thread

class CodePushNativeModule(private val reactContext: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactContext) {

  override fun getName(): String = "CodePushNative"

  private val prefsName = "CodePushPrefs"
  private val activeVersionKey = "codepush_active_version"

  @ReactMethod
  fun getCurrentBundleVersion(promise: Promise) {
    try {
      val prefs = reactContext.getSharedPreferences(prefsName, Context.MODE_PRIVATE)
      val version = prefs.getString(activeVersionKey, "") ?: ""
      promise.resolve(version)
    } catch (e: Exception) {
      promise.resolve("")
    }
  }

  @ReactMethod
  fun clearBundle(promise: Promise) {
    try {
      val bundleDir = File(reactContext.filesDir, "codepush_bundle")
      if (bundleDir.exists()) {
        bundleDir.deleteRecursively()
      }
      val prefs = reactContext.getSharedPreferences(prefsName, Context.MODE_PRIVATE)
      prefs.edit().remove(activeVersionKey).apply()
      promise.resolve(true)
    } catch (e: Exception) {
      promise.reject("CODEPUSH_CLEAR_FAILED", e.message, e)
    }
  }

  @ReactMethod
  fun restartApp() {
    try {
      val currentAct = reactApplicationContext.currentActivity
      val contextToUse = currentAct ?: reactApplicationContext
      val intent = contextToUse.packageManager.getLaunchIntentForPackage(contextToUse.packageName)
      if (intent != null) {
        intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TASK)
        contextToUse.startActivity(intent)
        currentAct?.finish()
        Runtime.getRuntime().exit(0)
      }
    } catch (e: Exception) {
      // Fallback: recreate activity if intent launch fails
      reactApplicationContext.currentActivity?.runOnUiThread {
        reactApplicationContext.currentActivity?.recreate()
      }
    }
  }

  @ReactMethod
  fun downloadAndApplyBundle(downloadUrl: String, version: String, promise: Promise) {
    thread {
      var connection: HttpURLConnection? = null
      var tempFile: File? = null
      try {
        var currentUrl = downloadUrl
        var redirectCount = 0
        val maxRedirects = 5

        // Follow redirects if any
        while (redirectCount < maxRedirects) {
          val url = URL(currentUrl)
          connection = url.openConnection() as HttpURLConnection
          connection.connectTimeout = 15000
          connection.readTimeout = 30000
          connection.instanceFollowRedirects = false
          connection.setRequestProperty("User-Agent", "CodePush-Android-Client")

          val status = connection.responseCode
          if (status == HttpURLConnection.HTTP_MOVED_TEMP ||
              status == HttpURLConnection.HTTP_MOVED_PERM ||
              status == HttpURLConnection.HTTP_SEE_OTHER ||
              status == 307 || status == 308) {
            val newLocation = connection.getHeaderField("Location")
            if (newLocation != null && newLocation.isNotEmpty()) {
              currentUrl = newLocation
              redirectCount++
              connection.disconnect()
              continue
            }
          }
          break
        }

        if (connection == null || connection.responseCode != HttpURLConnection.HTTP_OK) {
          throw Exception("Server returned HTTP response ${connection?.responseCode ?: "unknown"}")
        }

        // Stream to temporary file in cache directory
        tempFile = File(reactContext.cacheDir, "codepush_update_${System.currentTimeMillis()}.tmp")
        BufferedInputStream(connection.inputStream).use { input ->
          FileOutputStream(tempFile).use { output ->
            val buffer = ByteArray(8192)
            var bytesRead: Int
            while (input.read(buffer).also { bytesRead = it } != -1) {
              output.write(buffer, 0, bytesRead)
            }
            output.flush()
          }
        }

        val bundleDir = File(reactContext.filesDir, "codepush_bundle")
        if (!bundleDir.exists()) {
          bundleDir.mkdirs()
        }

        // Detect if file is a ZIP archive (magic bytes 0x50, 0x4B)
        val isZip = isZipFile(tempFile)

        if (isZip) {
          // Extract zip contents
          ZipInputStream(BufferedInputStream(FileInputStream(tempFile))).use { zis ->
            var entry: ZipEntry?
            while (zis.nextEntry.also { entry = it } != null) {
              val currentEntry = entry ?: break
              val fileName = currentEntry.name

              // Prevent directory traversal vulnerability
              val outFile = File(bundleDir, fileName)
              if (!outFile.canonicalPath.startsWith(bundleDir.canonicalPath)) {
                zis.closeEntry()
                continue
              }

              if (currentEntry.isDirectory) {
                outFile.mkdirs()
              } else {
                outFile.parentFile?.mkdirs()
                FileOutputStream(outFile).use { fos ->
                  val buf = ByteArray(8192)
                  var len: Int
                  while (zis.read(buf).also { len = it } != -1) {
                    fos.write(buf, 0, len)
                  }
                  fos.flush()
                }
              }
              zis.closeEntry()
            }
          }
        } else {
          // Raw bundle file
          val destBundle = File(bundleDir, "index.android.bundle")
          tempFile.copyTo(destBundle, overwrite = true)
        }

        // Save active version into SharedPreferences
        val prefs = reactContext.getSharedPreferences(prefsName, Context.MODE_PRIVATE)
        prefs.edit().putString(activeVersionKey, version).apply()

        promise.resolve(true)
      } catch (e: Exception) {
        promise.reject("CODEPUSH_DOWNLOAD_FAILED", e.message, e)
      } finally {
        try {
          connection?.disconnect()
          tempFile?.delete()
        } catch (_: Exception) {}
      }
    }
  }

  private fun isZipFile(file: File): Boolean {
    if (!file.exists() || file.length() < 4) return false
    FileInputStream(file).use { fis ->
      val b1 = fis.read()
      val b2 = fis.read()
      return b1 == 0x50 && b2 == 0x4B // 'PK'
    }
  }

  @ReactMethod
  fun getLocalIpAddress(promise: Promise) {
    try {
      val interfaces = Collections.list(NetworkInterface.getNetworkInterfaces())
      for (intf in interfaces) {
        val addrs = Collections.list(intf.inetAddresses)
        for (addr in addrs) {
          if (!addr.isLoopbackAddress) {
            val sAddr = addr.hostAddress ?: continue
            val isIPv4 = sAddr.indexOf(':') < 0
            if (isIPv4) {
              promise.resolve(sAddr)
              return
            }
          }
        }
      }
      promise.resolve("127.0.0.1")
    } catch (e: Exception) {
      promise.resolve("127.0.0.1")
    }
  }
}
