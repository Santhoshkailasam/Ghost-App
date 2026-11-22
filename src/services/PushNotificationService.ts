// src/services/PushNotificationService.ts
import {
  getMessaging,
  getToken,
  requestPermission,
  onMessage,
  subscribeToTopic,
  AuthorizationStatus,
  type RemoteMessage,
} from '@react-native-firebase/messaging';
import notifee, { AndroidImportance, EventType } from '@notifee/react-native';
import { Linking, Platform } from 'react-native';
import { NotificationDeduplicationService } from './NotificationDeduplicationService';

export const PushNotificationService = {
  fcmToken: '' as string,

  async isPushAlreadyHandled(id?: string | null, title?: string | null, body?: string | null): Promise<boolean> {
    const key = id || (title ? `${title}:::${body || ''}` : null);
    if (!key) return false;
    return NotificationDeduplicationService.isPushShown(key);
  },

  async markPushHandled(id?: string | null, title?: string | null, body?: string | null): Promise<void> {
    const key = id || (title ? `${title}:::${body || ''}` : null);
    if (!key) return;
    await NotificationDeduplicationService.markPushShown(key);
  },

  // Initialize native permissions, audio channels, and listeners
  async init(): Promise<string | null> {
    try {
      console.log('🚀 [PushService] Initializing Native Push Notifications (FCM + Notifee)...');
      const messagingInstance = getMessaging();

      // 1. Request notification permissions (iOS & Android 13+)
      try {
        const authStatus = await requestPermission(messagingInstance);
        const enabled =
          authStatus === AuthorizationStatus.AUTHORIZED ||
          authStatus === AuthorizationStatus.PROVISIONAL;
        console.log(`📱 [PushService] Permission status: ${authStatus} (enabled: ${enabled})`);
      } catch (err) {
        console.warn('⚠️ [PushService] requestPermission error:', err);
      }

      try {
        await notifee.requestPermission();
      } catch (err) {
        console.warn('⚠️ [PushService] notifee.requestPermission error:', err);
      }

      // 2. Create Android Notification Channels with Custom Sound Support
      if (Platform.OS === 'android') {
        await notifee.createChannel({
          id: 'codepush_high_importance_channel',
          name: 'CodePush High Importance Notifications',
          importance: AndroidImportance.HIGH,
          sound: 'crystal_glass',
          vibration: true,
        });

        const tones = ['crystal_glass', 'electronic_pulse', 'subtle_pop', 'urgent_alarm', 'custom_notification', 'default'];
        for (const t of tones) {
          await notifee.createChannel({
            id: `codepush_channel_${t}`,
            name: `CodePush Notifications (${t})`,
            importance: AndroidImportance.HIGH,
            sound: t !== 'default' ? t : 'default',
            vibration: true,
          });
        }
      }

      // 3. Obtain Device FCM Token & Subscribe to Broadcast Topics
      let token: string | null = null;
      try {
        token = await getToken(messagingInstance);
        if (token) {
          this.fcmToken = token;
          console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
          console.log('📱 [FCM] Device Token for Testing Console:');
          console.log(token);
          console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

          // Subscribe to broadcast topics for instant fleet-wide push
          try {
            await subscribeToTopic(messagingInstance, 'all');
            await subscribeToTopic(messagingInstance, 'app_rCYp1a_mwrdt1u4_ln97h');
            console.log('✅ [FCM] Subscribed to topics: all, app_rCYp1a_mwrdt1u4_ln97h');
          } catch (topicErr) {
            console.warn('⚠️ [FCM] Topic subscription error:', topicErr);
          }

          // Register device token with backend
          try {
            fetch('https://codepushs.netlify.app/.netlify/functions/report-status', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                projectId: 'app_rCYp1a_mwrdt1u4_ln97h',
                platform: Platform.OS,
                fcmToken: token,
                action: 'FCM Device Token Registered',
              }),
            }).catch(() => {});
          } catch {}
        }
      } catch (err) {
        console.warn('⚠️ [FCM] Could not obtain FCM token:', err);
      }

      // 4. Foreground Push Notification Handler
      onMessage(messagingInstance, async (remoteMessage: RemoteMessage) => {
        const pushId = (remoteMessage.data?.pushId as string) || (remoteMessage.data?.id as string) || remoteMessage.messageId;
        const title = remoteMessage.notification?.title || (remoteMessage.data?.title as string) || 'CodePush Notification';
        const body = remoteMessage.notification?.body || (remoteMessage.data?.body as string) || '';

        await this.displayNativePush({
          title,
          body,
          soundTone: (remoteMessage.data?.soundTone as string) || 'default',
          route: (remoteMessage.data?.route as string) || (remoteMessage.data?.deepLink as string),
          data: { ...remoteMessage.data, pushId },
        });
      });

      // 5. Deep Link handler on notification tap
      notifee.onForegroundEvent(({ type, detail }) => {
        if (type === EventType.PRESS && detail.notification?.data?.route) {
          const route = detail.notification.data.route as string;
          Linking.openURL(route).catch(() => {});
        }
      });

      // 6. Cold-start handler when opened from notification
      const initialNotification = await notifee.getInitialNotification();
      if (initialNotification?.notification.data?.route) {
        const route = initialNotification.notification.data.route as string;
        setTimeout(() => {
          Linking.openURL(route).catch(() => {});
        }, 800);
      }

      return token;
    } catch (error) {
      console.warn('❌ [PushService] Failed to initialize PushNotificationService:', error);
      return null;
    }
  },

  // Display native notification banner with custom tone & deep links
  async displayNativePush(payload: {
    title?: string;
    body?: string;
    soundTone?: string;
    route?: string;
    data?: Record<string, any>;
  }): Promise<void> {
    try {
      const pushId = payload.data?.pushId || payload.data?.id || (payload.title ? `${payload.title}:::${payload.body || ''}` : null);
      if (pushId && (await this.isPushAlreadyHandled(pushId, payload.title, payload.body))) return;
      if (pushId) await this.markPushHandled(pushId, payload.title, payload.body);

      const rawTone = payload.soundTone || 'default';
      const BUNDLED_TONES = ['crystal_glass', 'electronic_pulse', 'subtle_pop', 'urgent_alarm', 'custom_notification'];
      let cleanTone = 'default';
      if (rawTone !== 'default' && rawTone !== 'silent') {
        const parsed = String(rawTone).replace(/\.[^/.]+$/, '').toLowerCase();
        cleanTone = BUNDLED_TONES.includes(parsed) ? parsed : 'custom_notification';
      } else if (rawTone === 'silent') {
        cleanTone = 'silent';
      }

      const channelId = cleanTone !== 'default' && cleanTone !== 'silent'
        ? `codepush_channel_${cleanTone}`
        : 'codepush_high_importance_channel';

      if (Platform.OS === 'android') {
        try {
          await notifee.createChannel({
            id: channelId,
            name: `CodePush Notifications (${cleanTone})`,
            importance: AndroidImportance.HIGH,
            sound: cleanTone !== 'silent' && cleanTone !== 'default' ? cleanTone : undefined,
            vibration: true,
          });
        } catch {}
      }

      await notifee.displayNotification({
        title: payload.title || 'CodePush Notification',
        body: payload.body || 'You have received a new update',
        android: {
          channelId,
          sound: cleanTone !== 'silent' ? cleanTone : undefined,
          pressAction: { id: 'default' },
          smallIcon: 'ic_notification',
          largeIcon: 'ic_launcher',
          color: '#0284c7',
        },
        ios: {
          sound: cleanTone !== 'silent' ? `${cleanTone}.mp3` : undefined,
        },
        data: {
          ...payload.data,
          route: payload.route || '',
          soundTone: cleanTone,
        },
      });
    } catch (err) {
      console.warn('❌ [PushService] displayNativePush error:', err);
      try {
        const { Alert } = require('react-native');
        Alert.alert(payload.title || 'CodePush Notification', payload.body || 'You have received a new update');
      } catch {}
    }
  },
};
