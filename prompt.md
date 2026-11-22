Click Download to get the generated codepush.json file.
Save this file directly in the root folder of your React Native project (next to package.json).
Your credentials (App ID and API Key) are automatically pre-configured.

Create a directory named src/services/ in your project.
Click Download on both files above and place them into src/services/.
Both services are pre-configured with your project credentials and ready to run immediately.

import React, { useEffect } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { CodePushService } from './src/services/CodePushService';
import { PushNotificationService } from './src/services/PushNotificationService';

export default function App() {
  useEffect(() => {
    // 1. Arm Boot Watchdog
    CodePushService.startBootWatchdog();

    // 2. Check updates in background after launch
    const checkTimer = setTimeout(() => {
      CodePushService.checkForUpdates();
    }, 1200);

    // 3. Live alert & push listeners
    const stopAlertListener = CodePushService.startLiveAlertListener();
    const stopPushListener = CodePushService.startLivePushNotificationListener();

    // 4. Init Push permissions
    PushNotificationService.init();

    return () => {
      clearTimeout(checkTimer);
      stopAlertListener();
      stopPushListener();
    };
  }, []);

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Welcome to GhostAPI!</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#0f172a' },
  title: { color: '#f8fafc', fontSize: 20, fontWeight: 'bold' },
});
Import Services: Import CodePushService and PushNotificationService into your root App.tsx.
Arm Watchdog: Inside your root useEffect, call CodePushService.startBootWatchdog() immediately to guard against crash loops.
Background Checks: Trigger CodePushService.checkForUpdates() after app launch to silently download releases.
Register FCM: Call PushNotificationService.init() to request permissions and capture push tokens.