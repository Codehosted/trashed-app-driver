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

/**
 * Displays a system-level notification immediately.
 * 
 * This creates a SYSTEM notification (appears in notification tray, lock screen, etc.)
 * - Works even when app is in background or closed
 * - Requires notification permissions
 * - Called "local" because it's triggered by the app itself (not pushed from a server)
 * 
 * Note: Despite using scheduleNotificationAsync, trigger: null means it shows immediately, not scheduled.
 * 
 * For in-app-only notifications (UI components), use NotificationPanel component instead.
 */
export async function showLocalNotification(title: string, body: string) {
  await Notifications.scheduleNotificationAsync({
    content: { title, body },
    trigger: null, // null trigger = show immediately
  });
}

/**
 * @deprecated Use showLocalNotification instead. This function doesn't actually schedule anything.
 */
export async function scheduleLocalNotification(title: string, body: string) {
  return showLocalNotification(title, body);
}

export type NotificationPayload = {
  id: string;
  title: string;
  body: string;
  category?: 'info' | 'warning' | 'urgent';
};

/**
 * Sets up listeners for external push notifications (sent from server).
 * 
 * External push notifications are the 3rd type of notification:
 * 1. Local notifications - triggered by app itself
 * 2. In-app notifications - UI components
 * 3. External/Push notifications - sent from server using push token
 * 
 * @param onNotificationReceived - Callback when notification arrives (app in foreground)
 * @param onNotificationTapped - Callback when user taps notification (app in background/closed)
 * @returns Cleanup function to remove listeners
 */
export function setupPushNotificationListeners(
  onNotificationReceived?: (notification: Notifications.Notification) => void,
  onNotificationTapped?: (response: Notifications.NotificationResponse) => void
): () => void {
  // Listener for notifications received while app is in foreground
  const receivedSubscription = Notifications.addNotificationReceivedListener((notification) => {
    onNotificationReceived?.(notification);
  });

  // Listener for when user taps on a notification (app was in background or closed)
  const responseSubscription = Notifications.addNotificationResponseReceivedListener((response) => {
    onNotificationTapped?.(response);
  });

  // Return cleanup function
  return () => {
    receivedSubscription.remove();
    responseSubscription.remove();
  };
}

export async function fetchAndDisplayNotification(endpoint: string): Promise<NotificationPayload | null> {
  try {
    const response = await fetch(endpoint);
    if (!response.ok) return null;
    const payload: NotificationPayload = await response.json();
    if (payload?.title && payload?.body) {
      await showLocalNotification(payload.title, payload.body);
      return payload;
    }
  } catch (error) {
    console.error('Failed to fetch notification', error);
  }
  return null;
}
