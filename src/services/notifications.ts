import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import Constants from 'expo-constants';
import { Platform } from 'react-native';

export interface PushRegistration {
  pushToken?: string;
  status: 'idle' | 'requesting' | 'ready' | 'denied';
}

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: false,
    shouldSetBadge: false,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

export async function registerForPushNotificationsAsync(): Promise<PushRegistration> {
  if (!Device.isDevice) {
    return { status: 'denied' };
  }

  const { status: existingStatus } = await Notifications.getPermissionsAsync();
  let finalStatus = existingStatus;

  if (existingStatus !== 'granted') {
    const { status } = await Notifications.requestPermissionsAsync();
    finalStatus = status;
  }

  if (finalStatus !== 'granted') {
    return { status: 'denied' };
  }

  const projectId = Constants.expoConfig?.extra?.eas?.projectId;
  const token = projectId
    ? (await Notifications.getExpoPushTokenAsync({ projectId })).data
    : undefined;

  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('default', {
      name: 'default',
      importance: Notifications.AndroidImportance.MAX,
    });
  }

  return { status: 'ready', pushToken: token };
}

export async function scheduleLocalNotification(title: string, body: string) {
  await Notifications.scheduleNotificationAsync({
    content: { title, body },
    trigger: null,
  });
}

export type NotificationPayload = {
  id: string;
  title: string;
  body: string;
  category?: 'info' | 'warning' | 'urgent';
};

export async function fetchAndDisplayNotification(endpoint: string): Promise<NotificationPayload | null> {
  try {
    const response = await fetch(endpoint);
    if (!response.ok) return null;
    const payload: NotificationPayload = await response.json();
    if (payload?.title && payload?.body) {
      await scheduleLocalNotification(payload.title, payload.body);
      return payload;
    }
  } catch (error) {
    console.error('Failed to fetch notification', error);
  }
  return null;
}
