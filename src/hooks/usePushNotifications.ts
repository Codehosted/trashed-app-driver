import { useEffect } from 'react';
import * as Notifications from 'expo-notifications';
import { setupPushNotificationListeners } from '@/services/notifications';

/**
 * Hook to automatically set up listeners for external push notifications.
 * 
 * This handles the 3rd type of notifications: external push notifications sent from a server.
 * The listeners will:
 * - Handle notifications received while app is in foreground
 * - Handle notifications tapped when app was in background/closed
 * 
 * @param onNotificationReceived - Optional callback when notification arrives (app in foreground)
 * @param onNotificationTapped - Optional callback when user taps notification (app in background/closed)
 */
export function usePushNotifications(
  onNotificationReceived?: (notification: Notifications.Notification) => void,
  onNotificationTapped?: (response: Notifications.NotificationResponse) => void
) {
  useEffect(() => {
    const cleanup = setupPushNotificationListeners(onNotificationReceived, onNotificationTapped);
    return cleanup;
  }, [onNotificationReceived, onNotificationTapped]);
}

