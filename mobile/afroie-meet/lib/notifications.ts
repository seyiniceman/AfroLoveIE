import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import { supabase } from './supabase';

export type NotificationKind = 'new_intro' | 'new_match' | 'new_message' | 'verification_approved';

export type NotificationEvent = {
  id: number;
  kind: NotificationKind;
  title: string;
  body: string;
  data: Record<string, unknown>;
  created_at: string;
};

let handlerConfigured = false;

export function configureNotificationHandler() {
  if (handlerConfigured || Platform.OS === 'web') return;
  handlerConfigured = true;
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: true,
      shouldSetBadge: false,
    }),
  });
}

export async function registerForPushNotifications(enabled: boolean): Promise<{ token: string | null; status: string }> {
  if (!supabase) return { token: null, status: 'unavailable' };
  if (!enabled) {
    await supabase.rpc('register_push_token', { token: null, platform: Platform.OS });
    return { token: null, status: 'disabled' };
  }
  if (Platform.OS === 'web') {
    return { token: null, status: 'web' };
  }

  configureNotificationHandler();

  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('default', {
      name: 'AfroIE Meet',
      importance: Notifications.AndroidImportance.MAX,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: '#C98A2E',
    });
  }

  const existing = await Notifications.getPermissionsAsync();
  let finalStatus = existing.status;
  if (finalStatus !== 'granted') {
    const requested = await Notifications.requestPermissionsAsync();
    finalStatus = requested.status;
  }
  if (finalStatus !== 'granted') {
    return { token: null, status: 'denied' };
  }

  const projectId =
    (Constants.expoConfig?.extra as { eas?: { projectId?: string } } | undefined)?.eas?.projectId ??
    Constants.easConfig?.projectId;

  try {
    const tokenResult = projectId
      ? await Notifications.getExpoPushTokenAsync({ projectId })
      : await Notifications.getExpoPushTokenAsync();
    const token = tokenResult.data;
    await supabase.rpc('register_push_token', { token, platform: Platform.OS });
    return { token, status: 'registered' };
  } catch {
    // Physical device / EAS projectId may be absent in simulator; local notifications still work.
    return { token: null, status: 'local_only' };
  }
}

export async function pollAndDeliverNotifications(userId: string, enabled: boolean): Promise<NotificationEvent[]> {
  if (!supabase || !enabled) return [];
  const res = await supabase.rpc('my_notifications');
  if (res.error || !Array.isArray(res.data)) return [];
  const events = res.data as NotificationEvent[];
  if (!events.length) return [];

  const storageKey = 'last-notif-id:' + userId;
  const stored = await AsyncStorage.getItem(storageKey).catch(() => null);
  const newestId = events[0].id;

  if (stored === null) {
    // Seed baseline on first load so historical events do not spam the device.
    await AsyncStorage.setItem(storageKey, String(newestId)).catch(() => {});
    return [];
  }

  const lastSeen = Number(stored) || 0;
  const unseen = events.filter((e) => e.id > lastSeen).reverse();
  if (!unseen.length) return [];

  await AsyncStorage.setItem(storageKey, String(newestId)).catch(() => {});

  if (Platform.OS !== 'web') {
    configureNotificationHandler();
    for (const item of unseen) {
      await Notifications.scheduleNotificationAsync({
        content: {
          title: item.title,
          body: item.body,
          data: { ...item.data, kind: item.kind },
        },
        trigger: null,
      }).catch(() => {});
    }
  }
  return unseen;
}
