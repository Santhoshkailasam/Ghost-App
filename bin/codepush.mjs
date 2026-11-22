#!/usr/bin/env node
/**
 * GhostAPI CodePush CLI Publisher for GitHub Actions CI/CD
 */
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';

function parseArgs() {
  const args = process.argv.slice(2);
  const parsed = {
    command: args[0],
    app: '',
    key: '',
    platform: 'android',
    version: '',
    bundle: '',
    track: 'production',
    rollout: '100',
    canary: '0',
    notes: 'OTA Update',
  };

  for (let i = 1; i < args.length; i++) {
    const arg = args[i];
    if (arg.startsWith('--')) {
      const key = arg.slice(2);
      const val = args[i + 1] && !args[i + 1].startsWith('--') ? args[++i] : 'true';
      parsed[key] = val;
    }
  }

  return parsed;
}

async function main() {
  const opts = parseArgs();

  console.log('============================================================');
  console.log('🚀 GHOSTAPI CODEPUSH AUTO-RELEASE PIPELINE');
  console.log('============================================================');
  console.log(`📌 App ID:    ${opts.app}`);
  console.log(`📱 Platform:  ${opts.platform}`);
  console.log(`🏷️  Version:   v${opts.version}`);
  console.log(`📦 Bundle:    ${opts.bundle}`);
  console.log(`📝 Notes:     ${opts.notes}`);
  console.log('------------------------------------------------------------');

  if (!opts.app || !opts.key) {
    console.error('❌ Error: Missing required --app (App ID) or --key (API Key)');
    process.exit(1);
  }

  const bundlePath = path.resolve(opts.bundle);
  if (!fs.existsSync(bundlePath)) {
    console.error(`❌ Error: Bundle file not found at ${bundlePath}`);
    process.exit(1);
  }

  const fileBuffer = fs.readFileSync(bundlePath);
  const bundleBase64 = fileBuffer.toString('base64');
  const bundleHash = crypto.createHash('sha256').update(fileBuffer).digest('hex');

  console.log(`📦 Archive Size: ${(fileBuffer.length / 1024).toFixed(1)} KB`);
  console.log(`🔑 SHA-256 Hash: ${bundleHash}`);

  // 1. Send to Firebase RTDB for instant CDN broadcast
  try {
    const versionKey = opts.version.replace(/\./g, '_');
    const rtdbUrl = 'https://tracker-42b47-default-rtdb.asia-southeast1.firebasedatabase.app/codepush_releases';
    await Promise.allSettled([
      fetch(`${rtdbUrl}/bundles/${opts.platform}.json`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(bundleBase64),
      }),
      fetch(`${rtdbUrl}/bundles/${opts.platform}_${versionKey}.json`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(bundleBase64),
      }),
    ]);
  } catch (err) {
    console.warn('⚠️ Warning: Direct RTDB sync notice:', err.message);
  }

  // 2. Publish to Netlify Edge Release Engine
  const payload = {
    platform: opts.platform,
    projectId: opts.app,
    version: opts.version,
    bundleBase64: bundleBase64,
    hash: bundleHash,
    downloadUrl: `https://codepushs.netlify.app/.netlify/functions/download-bundle?version=${opts.version}&platform=${opts.platform}`,
    mandatory: true,
    releaseNotes: opts.notes,
    rollout: parseInt(opts.rollout, 10) || 100,
  };

  console.log('⏳ Publishing release to GhostAPI CodePush Server...');
  const res = await fetch('https://codepushs.netlify.app/.netlify/functions/publish-release', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-codepush-api-key': opts.key,
    },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const errorBody = await res.text();
    console.error('❌ CODEPUSH PUBLISH FAILED:', res.status, errorBody);
    process.exit(1);
  }

  const result = await res.json().catch(() => ({}));
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log(`✅ SUCCESS: CodePush OTA Release v${opts.version} is now LIVE!`);
  console.log(`📱 Target: ${opts.platform.toUpperCase()} (${opts.rollout}% Rollout)`);
  if (result.message) console.log(`📢 Server: ${result.message}`);
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
}

main().catch((err) => {
  console.error('❌ Fatal publish error:', err);
  process.exit(1);
});
