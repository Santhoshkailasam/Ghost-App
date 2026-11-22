// src/services/NotificationDeduplicationService.ts
import AsyncStorage from '@react-native-async-storage/async-storage';

const SHOWN_ALERTS_KEY = '@codepush_persistent_shown_alerts_v2';
const SHOWN_PUSHES_KEY = '@codepush_persistent_shown_pushes_v2';

const shownAlerts = new Set<string>();
const shownPushes = new Set<string>();
let isLoaded = false;
let loadPromise: Promise<void> | null = null;

export const NotificationDeduplicationService = {
  sessionStartTime: Date.now(),

  async ensureLoaded(): Promise<void> {
    if (isLoaded) return;
    if (loadPromise) return loadPromise;

    loadPromise = (async () => {
      try {
        const [alertsData, pushesData] = await Promise.all([
          AsyncStorage.getItem(SHOWN_ALERTS_KEY),
          AsyncStorage.getItem(SHOWN_PUSHES_KEY),
        ]);
        if (alertsData) {
          const arr: string[] = JSON.parse(alertsData);
          arr.forEach((id: string) => shownAlerts.add(id));
        }
        if (pushesData) {
          const arr: string[] = JSON.parse(pushesData);
          arr.forEach((id: string) => shownPushes.add(id));
        }
        isLoaded = true;
      } catch (e) {
        console.warn('⚠️ [Deduplication] Failed loading persistent history:', e);
      }
    })();
    return loadPromise;
  },

  async isAlertShown(id: string): Promise<boolean> {
    await this.ensureLoaded();
    return shownAlerts.has(id);
  },

  async markAlertShown(id: string): Promise<void> {
    await this.ensureLoaded();
    if (!id) return;
    shownAlerts.add(id);
    try {
      const list = Array.from(shownAlerts).slice(-150);
      await AsyncStorage.setItem(SHOWN_ALERTS_KEY, JSON.stringify(list));
    } catch {}
  },

  async isPushShown(id: string): Promise<boolean> {
    await this.ensureLoaded();
    return shownPushes.has(id);
  },

  async markPushShown(id: string): Promise<void> {
    await this.ensureLoaded();
    if (!id) return;
    shownPushes.add(id);
    try {
      const list = Array.from(shownPushes).slice(-150);
      await AsyncStorage.setItem(SHOWN_PUSHES_KEY, JSON.stringify(list));
    } catch {}
  },
};

// Eager initialization on import
NotificationDeduplicationService.ensureLoaded();
