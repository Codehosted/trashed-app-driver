# Push Notifications Configuration & Management

This document outlines how the Trashed Driver app is configured to receive and manage push notifications across iOS, Android, and web platforms.

## Overview

The app uses **Expo Notifications** (`expo-notifications`) for push notification handling on mobile platforms (iOS/Android) and **Firebase Cloud Messaging (FCM)** for web. Push notifications are automatically registered on app load, and user preferences control which notification types are displayed.

### Three Types of Notifications

1. **Local/System Notifications** - Triggered by the app itself using `showLocalNotification()`
   - Appears in notification tray, lock screen
   - Works when app is closed/backgrounded
   - Example: Reminder set by user, local alert

2. **In-App Notifications** - UI components displayed only within the app
   - Only visible when app is open
   - Styled components in the app UI
   - Example: `NotificationPanel` component

3. **External/Push Notifications** - Sent from a server using the push token
   - Received via Expo Push Notification service
   - Handled automatically by `setNotificationHandler`
   - Can be listened to with `setupPushNotificationListeners`
   - Example: Server sends notification about new route assignment

## Architecture

### Mobile (iOS/Android) - Expo Notifications

The mobile implementation uses Expo's notification system with the following flow:

1. **Automatic Registration**: Push registration is triggered automatically when the app loads via the `usePushRegistration` hook
2. **Permission Handling**: The app requests notification permissions if not already granted
3. **Token Generation**: Expo Push Token is generated using the EAS project ID
4. **Channel Configuration**: Android-specific notification channels are configured
5. **Notification Display**: Notifications are displayed both as system notifications and in-app

### Web - Firebase Cloud Messaging

The web implementation uses Firebase Cloud Messaging:

1. **Permission Request**: Triggered on user login/authentication
2. **FCM Token**: Firebase generates a registration token
3. **Foreground Messages**: Handled via `onMessageListener` for in-app display
4. **Background Messages**: Handled by Firebase service worker

## Configuration

### Expo Configuration (`app.config.ts`)

```71:74:app.config.ts
  extra: {
    eas: {
      projectId: '1804841b-3977-429b-af4a-849ba0657920'
    },
```

The EAS project ID is required for generating Expo Push Tokens on mobile platforms. This is configured in the `app.config.ts` file under `extra.eas.projectId`.

### Notification Handler Configuration

```11:19:src/services/notifications.ts
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: false,
    shouldSetBadge: false,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});
```

The notification handler is configured to:
- **Show alerts**: Display notification alerts when received
- **No sound**: Notifications are silent by default
- **No badge**: App icon badge is not updated
- **Show banner**: Display notification banners
- **Show in list**: Include notifications in the notification list

## Registration Flow

### Mobile Registration (`usePushRegistration` Hook)

```4:16:src/hooks/usePushRegistration.ts
export function usePushRegistration() {
  const [registration, setRegistration] = useState<PushRegistration>({ status: 'idle' });

  useEffect(() => {
    (async () => {
      setRegistration({ status: 'requesting' });
      const result = await registerForPushNotificationsAsync();
      setRegistration(result);
    })();
  }, []);

  return registration;
}
```

The hook automatically registers for push notifications when the component mounts. It returns a registration object with:
- `status`: Current registration status (`'idle' | 'requesting' | 'ready' | 'denied'`)
- `pushToken`: The Expo Push Token string (if registration succeeded)

### Registration Function (`registerForPushNotificationsAsync`)

```21:51:src/services/notifications.ts
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
```

**Registration Steps:**
1. **Device Check**: Verifies the app is running on a physical device (not simulator/emulator)
2. **Permission Check**: Checks existing notification permissions
3. **Permission Request**: Requests permissions if not already granted
4. **Token Generation**: Generates Expo Push Token using EAS project ID
5. **Android Channel Setup**: Configures Android notification channel with maximum importance

**Important Notes:**
- Registration fails on simulators/emulators (returns `status: 'denied'`)
- Token generation requires a valid EAS project ID
- Android requires notification channel configuration for Android 8.0+

## User Preferences

### Notification Preferences Interface

```47:54:src/types/domain.ts
export interface NotificationPreferences {
  routeAlerts: boolean;
  marketing: boolean;
  betaFeatures: boolean;
  newAssignments?: boolean; // Legacy support
  routeChanges?: boolean; // Legacy support
  etaAlerts?: boolean; // Legacy support
}
```

### Default Preferences

```12:16:src/context/PreferencesContext.tsx
const DEFAULT_PREFS: NotificationPreferences = {
  routeAlerts: true,
  marketing: false,
  betaFeatures: true,
};
```

### Preferences Management

Preferences are managed through the `PreferencesContext`:

```46:49:src/context/PreferencesContext.tsx
  const updateNotificationPreferences = async (next: NotificationPreferences) => {
    setNotificationPreferences(next);
    await persist(theme, next);
  };
```

Preferences are:
- Stored in AsyncStorage under the key `'driver_preferences'`
- Persisted automatically when updated
- Accessible throughout the app via `usePreferences()` hook

## Notification Display

The app uses **three different notification systems**:

1. **Local/System Notifications** (via `showLocalNotification`) - Triggered by the app itself, appear in device notification tray, lock screen, etc.
2. **In-App Notifications** (via `NotificationPanel`) - Display only within the app UI
3. **External/Push Notifications** (via `setupPushNotificationListeners`) - Sent from a server using the push token, handled automatically

### System Notifications (Local Notifications)

```53:62:src/services/notifications.ts
export async function showLocalNotification(title: string, body: string) {
  await Notifications.scheduleNotificationAsync({
    content: { title, body },
    trigger: null, // null trigger = show immediately
  });
}
```

**What are "Local Notifications"?**
- **System-level notifications** that appear in the device's notification tray, lock screen, and notification center
- Work even when the app is in the background or closed
- Called "local" because they're **triggered locally by the app** (not pushed from a remote server)
- Require notification permissions to be granted
- Different from "push notifications" which come from a server via Expo Push Notification service

**Important Notes:**
- Despite using `scheduleNotificationAsync`, when `trigger: null` is passed, the notification is displayed **immediately**, not scheduled for later
- To actually schedule a notification for a future time, provide a trigger object (e.g., `{ seconds: 60 }` for 60 seconds from now)
- These are **NOT** in-app-only - they're real system notifications that appear outside the app

### API-Triggered Notifications

```67:80:src/services/notifications.ts
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
```

The app can fetch notifications from a configured API endpoint and display them as local notifications.

### Notification Payload Type

```60:65:src/services/notifications.ts
export type NotificationPayload = {
  id: string;
  title: string;
  body: string;
  category?: 'info' | 'warning' | 'urgent';
};
```

### In-App Notification Display

```11:29:src/components/NotificationPanel.tsx
export const NotificationPanel: React.FC<Props> = ({ notifications }: Props) => {
  const { theme } = usePreferences();
  const palette = designSchema.theme[theme];

  return (
    <View style={[styles.container, { backgroundColor: palette.card }]}> 
      <Text style={[styles.title, { color: palette.text }]}>In-app notifications</Text>
      {notifications.map((notification) => (
        <View key={notification.id} style={[styles.item, { borderColor: palette.accent }]}> 
          <Text style={[styles.itemTitle, { color: palette.text }]}>{notification.title}</Text>
          <Text style={[styles.itemBody, { color: palette.subtleText }]}>{notification.body}</Text>
        </View>
      ))}
      {notifications.length === 0 && (
        <Text style={{ color: palette.subtleText }}>No notifications yet.</Text>
      )}
    </View>
  );
};
```

The `NotificationPanel` component displays notifications **only within the app UI** (not system notifications). This is a separate system from `showLocalNotification`:
- **System notifications** (`showLocalNotification`) = Appear in notification tray, work when app is closed
- **In-app notifications** (`NotificationPanel`) = Only visible when app is open, styled UI components

### External Push Notifications (From Server)

```86:108:src/services/notifications.ts
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
```

**External push notifications** are the third type - notifications sent from your server using the push token obtained from `registerForPushNotificationsAsync`. These are handled automatically:

- **Foreground**: When app is open, `setNotificationHandler` controls how they're displayed
- **Background/Closed**: System handles them automatically, user can tap to open app
- **Listeners**: Use `setupPushNotificationListeners` or `usePushNotifications` hook to handle custom logic when notifications arrive or are tapped

**How it works:**
1. `registerForPushNotificationsAsync` gets the push token
2. Send token to your backend server
3. Server sends push notifications via Expo Push Notification API
4. `setNotificationHandler` configures how they're displayed
5. `setupPushNotificationListeners` allows custom handling (e.g., updating UI, navigation)

The current implementation uses all three: when `fetchAndDisplayNotification` is called, it shows a system notification AND adds it to the in-app notification panel. External push notifications from the server are handled automatically via the notification handler.

## Usage in Screens

### HomeScreen Integration

```19:31:src/screens/HomeScreen.tsx
  const push = usePushRegistration();
  const sendWebhook = useStatusWebhook(WEBHOOK_ENDPOINT);
  const [notifications, setNotifications] = useState<NotificationPayload[]>([]);
  const route = schema.sampleRoute;

  useEffect(() => {
    (async () => {
      const payload = await fetchAndDisplayNotification(NOTIFICATION_ENDPOINT);
      if (payload) {
        setNotifications((prev) => [payload, ...prev]);
      }
    })();
  }, []);
```

The HomeScreen:
- Uses `usePushRegistration()` to automatically register for push notifications
- Fetches notifications from `NOTIFICATION_ENDPOINT` on mount
- Displays push registration status and token
- Shows notification preferences toggles

### Push Registration Status Display

```109:112:src/screens/HomeScreen.tsx
      <View style={[styles.card, { backgroundColor: palette.card }]}> 
        <Text style={[styles.sectionTitle, { color: palette.text }]}>Push registration</Text>
        <Text style={{ color: palette.subtleText }}>Status: {push.status}</Text>
        {push.pushToken ? <Text style={{ color: palette.text }}>Token: {push.pushToken}</Text> : null}
      </View>
```

## Platform-Specific Considerations

### iOS
- Requires notification permissions to be granted by the user
- Push tokens are generated via Expo Push Notification service
- Background notifications are handled automatically by Expo

### Android
- Requires notification channel configuration (Android 8.0+)
- Default channel is created with `MAX` importance
- Notification permissions are automatically granted on Android 13+ (for basic notifications)

### Web
- Uses Firebase Cloud Messaging instead of Expo Notifications
- Requires service worker registration for background notifications
- Permission is requested via browser Notification API

## API Integration

### Notification Endpoint

The app is configured to fetch notifications from:
```12:12:src/screens/HomeScreen.tsx
const NOTIFICATION_ENDPOINT = 'https://example.com/api/driver/notifications';
```

**Expected Response Format:**
```json
{
  "id": "notification-uuid",
  "title": "Notification Title",
  "body": "Notification body text",
  "category": "info" // optional: "info" | "warning" | "urgent"
}
```

### Push Token Usage

Once a push token is obtained, it should be:
1. Sent to your backend server
2. Stored associated with the user/driver account
3. Used to send push notifications via Expo Push Notification API or Firebase Cloud Messaging

**Expo Push Notification API:**
```bash
POST https://exp.host/--/api/v2/push/send
Content-Type: application/json

{
  "to": "ExponentPushToken[xxxxxxxxxxxxxxxxxxxxxx]",
  "title": "Notification Title",
  "body": "Notification body",
  "data": { "customData": "value" }
}
```

## Key Files

| File | Purpose |
|------|---------|
| `src/services/notifications.ts` | Core notification registration and display logic |
| `src/hooks/usePushRegistration.ts` | React hook for automatic push registration |
| `src/context/PreferencesContext.tsx` | Manages user notification preferences |
| `src/components/NotificationPanel.tsx` | In-app notification display component |
| `src/screens/HomeScreen.tsx` | Integration example showing push registration and notifications |
| `app.config.ts` | Expo configuration including EAS project ID |
| `web/services/firebase.ts` | Web-specific Firebase Cloud Messaging implementation |

## Testing

### Testing Push Notifications

1. **Physical Device Required**: Push notifications only work on physical devices, not simulators/emulators
2. **Check Registration Status**: View the push registration status in HomeScreen
3. **Test Local Notifications**: Use `showLocalNotification()` to test notification display (displays immediately)
4. **Test API Notifications**: Configure `NOTIFICATION_ENDPOINT` to return test notifications

### Debugging

- Check `push.status` to verify registration state
- Log `push.pushToken` to verify token generation
- Check notification preferences in `PreferencesContext`
- Verify EAS project ID is correctly configured in `app.config.ts`

## Future Enhancements

Potential improvements:
- Background notification handlers for custom actions
- Notification categories for different notification types
- Rich notifications with images/actions
- Notification history/archiving
- Push token refresh handling
- Notification delivery tracking

