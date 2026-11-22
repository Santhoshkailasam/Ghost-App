import React, { useEffect } from 'react';
import { StatusBar, StyleSheet } from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { CodePushService } from './src/services/CodePushService';
import { PushNotificationService } from './src/services/PushNotificationService';
import { DashboardScreen } from './src/screens/DashboardScreen';

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
    <SafeAreaProvider>
      <StatusBar barStyle="dark-content" />
      <SafeAreaView style={styles.safeArea} edges={['top', 'left', 'right', 'bottom']}>
        <DashboardScreen />
      </SafeAreaView>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#F8FAFC',
  },
});
