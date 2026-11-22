import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  Platform,
} from 'react-native';
import { CodePushService, CODEPUSH_CONFIG } from '../services/CodePushService';
import { PushNotificationService } from '../services/PushNotificationService';

interface ActivityItem {
  id: string;
  time: string;
  title: string;
  type: 'info' | 'success' | 'warning' | 'alert';
}

export const DashboardScreen: React.FC = () => {
  const [isChecking, setIsChecking] = useState(false);
  const [isPinging, setIsPinging] = useState(false);
  const [lastCheckTime, setLastCheckTime] = useState<string>('Just now');
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [statusType, setStatusType] = useState<'success' | 'info' | 'warning'>('success');
  const [activities, setActivities] = useState<ActivityItem[]>([
    {
      id: '1',
      time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      title: 'CodePush Watchdog armed successfully',
      type: 'success',
    },
    {
      id: '2',
      time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      title: 'Native FCM push listeners initialized',
      type: 'info',
    },
  ]);

  const addActivity = (title: string, type: 'info' | 'success' | 'warning' | 'alert' = 'info') => {
    const newItem: ActivityItem = {
      id: Date.now().toString(),
      time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
      title,
      type,
    };
    setActivities((prev) => [newItem, ...prev.slice(0, 19)]);
  };

  const handleCheckUpdates = async () => {
    if (isChecking) return;
    setIsChecking(true);
    setStatusMessage('Checking CodePush server for new releases...');
    setStatusType('info');
    addActivity('Checking for over-the-air updates...', 'info');

    try {
      const result = await CodePushService.checkForUpdates();
      const now = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      setLastCheckTime(now);

      if (result.success) {
        setStatusMessage(result.message);
        setStatusType(result.updateAvailable ? 'warning' : 'success');
        addActivity(result.message, result.updateAvailable ? 'warning' : 'success');
      } else {
        setStatusMessage(result.message);
        setStatusType('warning');
        addActivity(`Check error: ${result.message}`, 'warning');
      }
    } catch {
      setStatusMessage('Failed to connect to CodePush server');
      setStatusType('warning');
      addActivity('Update check failed: Connection error', 'warning');
    } finally {
      setIsChecking(false);
    }
  };

  const handleTestNotification = async () => {
    try {
      addActivity('Triggering native test push notification...', 'info');
      await PushNotificationService.displayNativePush({
        title: '⚡ GhostAPI CodePush Alert',
        body: 'OTA engine and push notification pipelines are active and healthy!',
        soundTone: 'crystal_glass',
        data: { test: true, timestamp: Date.now().toString() },
      });
      addActivity('Native test notification dispatched', 'success');
      setStatusMessage('Test notification sent successfully!');
      setStatusType('success');
    } catch (error: any) {
      Alert.alert('Notification Error', error?.message || 'Failed to dispatch notification');
      addActivity('Failed to dispatch test notification', 'warning');
    }
  };

  const handleSendPing = async () => {
    if (isPinging) return;
    setIsPinging(true);
    addActivity('Dispatching telemetry diagnostic ping...', 'info');

    try {
      const ok = await CodePushService.sendDiagnosticPing('Dashboard Manual Ping');
      if (ok) {
        addActivity('Telemetry diagnostic ping logged (200 OK)', 'success');
        setStatusMessage('Telemetry ping confirmed by GhostAPI server.');
        setStatusType('success');
      } else {
        addActivity('Telemetry ping failed', 'warning');
      }
    } finally {
      setIsPinging(false);
    }
  };

  const handleEmergencyRollback = () => {
    Alert.alert(
      'Emergency Rollback',
      'This will discard the active OTA bundle and restart using the factory APK assets. Do you want to continue?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Rollback & Restart',
          style: 'destructive',
          onPress: async () => {
            addActivity('Initiating emergency factory rollback...', 'alert');
            await CodePushService.emergencyRollbackToFactory();
          },
        },
      ]
    );
  };

  const handleViewFCMToken = () => {
    const token = PushNotificationService.fcmToken;
    if (!token) {
      Alert.alert('FCM Token', 'FCM Token is registering or requires valid Firebase credentials on native build.');
    } else {
      Alert.alert('Device FCM Token', token);
    }
  };

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.contentContainer}
      showsVerticalScrollIndicator={false}
    >
      {/* 1. Header Bar */}
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <View style={styles.logoBadge}>
            <Text style={styles.logoIcon}>⚡</Text>
          </View>
          <View>
            <Text style={styles.headerKicker}>GHOSTAPI CONSOLE</Text>
            <Text style={styles.headerTitle}>{CODEPUSH_CONFIG.appName}</Text>
          </View>
        </View>

        <View style={styles.headerRight}>
          <View style={styles.onlineBadge}>
            <View style={styles.onlineDot} />
            <Text style={styles.onlineText}>ONLINE</Text>
          </View>
          <TouchableOpacity
            style={styles.refreshButton}
            onPress={handleCheckUpdates}
            disabled={isChecking}
          >
            {isChecking ? (
              <ActivityIndicator size="small" color="#4F46E5" />
            ) : (
              <Text style={styles.refreshIcon}>↻</Text>
            )}
          </TouchableOpacity>
        </View>
      </View>

      {/* 2. Status Banner */}
      {statusMessage && (
        <View
          style={[
            styles.banner,
            statusType === 'success' && styles.bannerSuccess,
            statusType === 'warning' && styles.bannerWarning,
            statusType === 'info' && styles.bannerInfo,
          ]}
        >
          <Text style={styles.bannerIcon}>
            {statusType === 'success' ? '✓' : statusType === 'warning' ? '⚠' : 'ℹ'}
          </Text>
          <Text style={styles.bannerText}>{statusMessage}</Text>
        </View>
      )}

      {/* 3. Hero Card - Deployment Overview */}
      <View style={styles.heroCard}>
        <View style={styles.heroHeader}>
          <View style={styles.pillLabel}>
            <Text style={styles.pillLabelText}>DEPLOYMENT OVERVIEW</Text>
          </View>
          <View style={styles.versionPill}>
            <Text style={styles.versionPillText}>v{CODEPUSH_CONFIG.version}</Text>
          </View>
        </View>

        <Text style={styles.heroTitle}>Production Environment</Text>
        <Text style={styles.heroSubtitle}>
          App is synced with CodePush live distribution on {CODEPUSH_CONFIG.serverUrl.replace('https://', '')}
        </Text>

        <View style={styles.divider} />

        <View style={styles.heroMetaRow}>
          <View style={styles.metaItem}>
            <Text style={styles.metaLabel}>Platform</Text>
            <Text style={styles.metaValue}>{Platform.OS.toUpperCase()}</Text>
          </View>
          <View style={styles.metaItem}>
            <Text style={styles.metaLabel}>Watchdog</Text>
            <Text style={[styles.metaValue, styles.metaWatchdog]}>ARMED (5s)</Text>
          </View>
          <View style={styles.metaItem}>
            <Text style={styles.metaLabel}>Last Sync</Text>
            <Text style={styles.metaValue}>{lastCheckTime}</Text>
          </View>
        </View>
      </View>

      {/* 4. Metrics Grid */}
      <View style={styles.metricsGrid}>
        <View style={styles.metricCard}>
          <View style={[styles.metricIconBox, styles.metricBoxIndigo]}>
            <Text style={styles.metricEmoji}>🚀</Text>
          </View>
          <Text style={styles.metricNumber}>v{CODEPUSH_CONFIG.version}</Text>
          <Text style={styles.metricLabel}>OTA Bundle</Text>
          <Text style={styles.metricSub}>Live silent updates</Text>
        </View>

        <View style={styles.metricCard}>
          <View style={[styles.metricIconBox, styles.metricBoxEmerald]}>
            <Text style={styles.metricEmoji}>🛡️</Text>
          </View>
          <Text style={styles.metricNumber}>Active</Text>
          <Text style={styles.metricLabel}>Crash Guard</Text>
          <Text style={styles.metricSub}>Boot loop protection</Text>
        </View>

        <View style={styles.metricCard}>
          <View style={[styles.metricIconBox, styles.metricBoxSky]}>
            <Text style={styles.metricEmoji}>🔔</Text>
          </View>
          <Text style={styles.metricNumber}>FCM</Text>
          <Text style={styles.metricLabel}>Push Pipeline</Text>
          <Text style={styles.metricSub}>Notifee sound channels</Text>
        </View>

        <View style={styles.metricCard}>
          <View style={[styles.metricIconBox, styles.metricBoxAmber]}>
            <Text style={styles.metricEmoji}>📡</Text>
          </View>
          <Text style={styles.metricNumber}>P2P Mesh</Text>
          <Text style={styles.metricLabel}>Zero-Egress</Text>
          <Text style={styles.metricSub}>Local relay standby</Text>
        </View>
      </View>

      {/* 5. Control Center */}
      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>Control Center</Text>
        <Text style={styles.sectionCaption}>Real-time actions & diagnostic controls</Text>
      </View>

      <View style={styles.actionsContainer}>
        {/* Check Updates Primary Button */}
        <TouchableOpacity
          style={[styles.primaryButton, isChecking && styles.buttonDisabled]}
          onPress={handleCheckUpdates}
          disabled={isChecking}
          activeOpacity={0.85}
        >
          {isChecking ? (
            <ActivityIndicator color="#FFFFFF" size="small" />
          ) : (
            <>
              <Text style={styles.primaryButtonIcon}>⚡</Text>
              <Text style={styles.primaryButtonText}>Check for OTA Updates</Text>
            </>
          )}
        </TouchableOpacity>

        {/* Secondary Buttons Row */}
        <View style={styles.actionRow}>
          <TouchableOpacity
            style={styles.secondaryButton}
            onPress={handleTestNotification}
            activeOpacity={0.7}
          >
            <Text style={styles.secondaryButtonIcon}>🔔</Text>
            <Text style={styles.secondaryButtonText}>Test Push</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.secondaryButton, isPinging && styles.buttonDisabled]}
            onPress={handleSendPing}
            disabled={isPinging}
            activeOpacity={0.7}
          >
            {isPinging ? (
              <ActivityIndicator color="#4F46E5" size="small" />
            ) : (
              <>
                <Text style={styles.secondaryButtonIcon}>📡</Text>
                <Text style={styles.secondaryButtonText}>Send Telemetry</Text>
              </>
            )}
          </TouchableOpacity>
        </View>

        {/* Emergency Rollback Button */}
        <TouchableOpacity
          style={styles.dangerButton}
          onPress={handleEmergencyRollback}
          activeOpacity={0.7}
        >
          <Text style={styles.dangerButtonIcon}>🚨</Text>
          <Text style={styles.dangerButtonText}>Emergency Rollback to Factory APK</Text>
        </TouchableOpacity>
      </View>

      {/* 6. Live Activity Feed */}
      <View style={styles.sectionHeader}>
        <View style={styles.activityHeaderRow}>
          <Text style={styles.sectionTitle}>Live Activity</Text>
          <TouchableOpacity onPress={() => setActivities([])}>
            <Text style={styles.clearText}>Clear</Text>
          </TouchableOpacity>
        </View>
        <Text style={styles.sectionCaption}>Real-time runtime logs and CodePush triggers</Text>
      </View>

      <View style={styles.activityCard}>
        {activities.length === 0 ? (
          <Text style={styles.emptyActivityText}>No recent activity logged</Text>
        ) : (
          activities.map((act, index) => (
            <View
              key={act.id}
              style={[
                styles.activityRow,
                index === activities.length - 1 && styles.activityRowLast,
              ]}
            >
              <View
                style={[
                  styles.activityDot,
                  act.type === 'success' && styles.dotSuccess,
                  act.type === 'warning' && styles.dotWarning,
                  act.type === 'alert' && styles.dotAlert,
                  act.type === 'info' && styles.dotInfo,
                ]}
              />
              <View style={styles.activityContent}>
                <Text style={styles.activityTitle}>{act.title}</Text>
                <Text style={styles.activityTime}>{act.time}</Text>
              </View>
            </View>
          ))
        )}
      </View>

      {/* 7. Configuration & Diagnostics */}
      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>Configuration & Keys</Text>
        <Text style={styles.sectionCaption}>Credentials loaded from codepush.json</Text>
      </View>

      <View style={styles.configCard}>
        <View style={styles.configRow}>
          <Text style={styles.configKey}>Project ID</Text>
          <Text style={styles.configValue}>{CODEPUSH_CONFIG.appId}</Text>
        </View>
        <View style={styles.configDivider} />
        <View style={styles.configRow}>
          <Text style={styles.configKey}>Server URL</Text>
          <Text style={styles.configValue}>{CODEPUSH_CONFIG.serverUrl}</Text>
        </View>
        <View style={styles.configDivider} />
        <View style={styles.configRow}>
          <Text style={styles.configKey}>API Key</Text>
          <Text style={styles.configValue}>
            {CODEPUSH_CONFIG.apiKey.slice(0, 12)}••••••••••••
          </Text>
        </View>
        <View style={styles.configDivider} />
        <View style={styles.configRow}>
          <Text style={styles.configKey}>Device Push Token</Text>
          <TouchableOpacity onPress={handleViewFCMToken}>
            <Text style={styles.tokenButtonText}>
              {PushNotificationService.fcmToken ? 'View Token' : 'Pending Init'}
            </Text>
          </TouchableOpacity>
        </View>
      </View>

      <View style={styles.footer}>
        <Text style={styles.footerText}>GhostAPI CodePush Client • v{CODEPUSH_CONFIG.version}</Text>
      </View>
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F8FAFC',
  },
  contentContainer: {
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 40,
  },
  /* Header */
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 20,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  logoBadge: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: '#4F46E5',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
    shadowColor: '#4F46E5',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 4,
  },
  logoIcon: {
    fontSize: 22,
    color: '#FFFFFF',
  },
  headerKicker: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 1.2,
    color: '#6366F1',
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: '#0F172A',
  },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  onlineBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#ECFDF5',
    borderColor: '#A7F3D0',
    borderWidth: 1,
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: 20,
  },
  onlineDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#10B981',
    marginRight: 5,
  },
  onlineText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#065F46',
  },
  refreshButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  refreshIcon: {
    fontSize: 18,
    color: '#4F46E5',
    fontWeight: 'bold',
  },

  /* Banner */
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    borderRadius: 12,
    marginBottom: 16,
    borderWidth: 1,
  },
  bannerSuccess: {
    backgroundColor: '#F0FDF4',
    borderColor: '#BBF7D0',
  },
  bannerWarning: {
    backgroundColor: '#FFFBEB',
    borderColor: '#FDE68A',
  },
  bannerInfo: {
    backgroundColor: '#EEF2FF',
    borderColor: '#C7D2FE',
  },
  bannerIcon: {
    fontSize: 14,
    fontWeight: 'bold',
    marginRight: 8,
    color: '#0F172A',
  },
  bannerText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#1E293B',
    flex: 1,
  },

  /* Hero Card */
  heroCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    padding: 20,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    marginBottom: 20,
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.04,
    shadowRadius: 16,
    elevation: 3,
  },
  heroHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  pillLabel: {
    backgroundColor: '#EEF2FF',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  pillLabelText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#4F46E5',
    letterSpacing: 0.5,
  },
  versionPill: {
    backgroundColor: '#F1F5F9',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  versionPillText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#475569',
  },
  heroTitle: {
    fontSize: 22,
    fontWeight: '800',
    color: '#0F172A',
    marginBottom: 4,
  },
  heroSubtitle: {
    fontSize: 13,
    color: '#64748B',
    lineHeight: 18,
  },
  divider: {
    height: 1,
    backgroundColor: '#F1F5F9',
    marginVertical: 16,
  },
  heroMetaRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  metaItem: {
    alignItems: 'flex-start',
  },
  metaLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: '#94A3B8',
    marginBottom: 4,
    textTransform: 'uppercase',
  },
  metaValue: {
    fontSize: 13,
    fontWeight: '700',
    color: '#1E293B',
  },
  metaWatchdog: {
    color: '#059669',
  },

  /* Metrics Grid */
  metricsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    marginBottom: 24,
  },
  metricCard: {
    width: '48%',
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.03,
    shadowRadius: 8,
    elevation: 2,
  },
  metricIconBox: {
    width: 36,
    height: 36,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 10,
  },
  metricBoxIndigo: {
    backgroundColor: '#EEF2FF',
  },
  metricBoxEmerald: {
    backgroundColor: '#ECFDF5',
  },
  metricBoxSky: {
    backgroundColor: '#F0F9FF',
  },
  metricBoxAmber: {
    backgroundColor: '#FFFBEB',
  },
  metricEmoji: {
    fontSize: 18,
  },
  metricNumber: {
    fontSize: 17,
    fontWeight: '800',
    color: '#0F172A',
    marginBottom: 2,
  },
  metricLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: '#334155',
  },
  metricSub: {
    fontSize: 11,
    color: '#94A3B8',
    marginTop: 2,
  },

  /* Section Headers */
  sectionHeader: {
    marginBottom: 12,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: '#0F172A',
  },
  sectionCaption: {
    fontSize: 12,
    color: '#64748B',
    marginTop: 2,
  },

  /* Actions */
  actionsContainer: {
    gap: 10,
    marginBottom: 24,
  },
  primaryButton: {
    backgroundColor: '#4F46E5',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    borderRadius: 14,
    shadowColor: '#4F46E5',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 10,
    elevation: 4,
  },
  primaryButtonIcon: {
    fontSize: 16,
    marginRight: 8,
  },
  primaryButtonText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '700',
  },
  buttonDisabled: {
    opacity: 0.65,
  },
  actionRow: {
    flexDirection: 'row',
    gap: 10,
  },
  secondaryButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    paddingVertical: 12,
    borderRadius: 14,
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.03,
    shadowRadius: 6,
    elevation: 1,
  },
  secondaryButtonIcon: {
    fontSize: 15,
    marginRight: 6,
  },
  secondaryButtonText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#334155',
  },
  dangerButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FEF2F2',
    borderWidth: 1,
    borderColor: '#FECACA',
    paddingVertical: 12,
    borderRadius: 14,
  },
  dangerButtonIcon: {
    fontSize: 14,
    marginRight: 6,
  },
  dangerButtonText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#DC2626',
  },

  /* Live Activity */
  activityHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  clearText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#6366F1',
  },
  activityCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    marginBottom: 24,
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.03,
    shadowRadius: 8,
    elevation: 2,
  },
  emptyActivityText: {
    fontSize: 13,
    color: '#94A3B8',
    textAlign: 'center',
    paddingVertical: 10,
  },
  activityRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#F8FAFC',
  },
  activityRowLast: {
    borderBottomWidth: 0,
    paddingBottom: 0,
  },
  activityDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginRight: 12,
  },
  dotSuccess: {
    backgroundColor: '#10B981',
  },
  dotWarning: {
    backgroundColor: '#F59E0B',
  },
  dotAlert: {
    backgroundColor: '#EF4444',
  },
  dotInfo: {
    backgroundColor: '#6366F1',
  },
  activityContent: {
    flex: 1,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  activityTitle: {
    fontSize: 13,
    fontWeight: '600',
    color: '#1E293B',
    flex: 1,
    marginRight: 8,
  },
  activityTime: {
    fontSize: 11,
    color: '#94A3B8',
    fontWeight: '500',
  },

  /* Config Card */
  configCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.03,
    shadowRadius: 8,
    elevation: 2,
    marginBottom: 20,
  },
  configRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 8,
  },
  configKey: {
    fontSize: 13,
    fontWeight: '600',
    color: '#64748B',
  },
  configValue: {
    fontSize: 13,
    fontWeight: '700',
    color: '#0F172A',
  },
  tokenButtonText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#4F46E5',
  },
  configDivider: {
    height: 1,
    backgroundColor: '#F1F5F9',
  },

  /* Footer */
  footer: {
    alignItems: 'center',
    marginTop: 10,
    marginBottom: 20,
  },
  footerText: {
    fontSize: 12,
    fontWeight: '500',
    color: '#94A3B8',
  },
});
