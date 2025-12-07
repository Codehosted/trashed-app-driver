# Trashed Driver App

Expo-managed driver experience for Android, iOS, and web. The app provides Firebase email/password auth (login, register, reset), a post-signup walkthrough, push + in-app notifications, saved preferences, and webhook callbacks when updating driver status.

## Running locally
1. Install dependencies with your preferred package manager (requires Node 18+). Example: `npm install`.
2. Start Expo: `npm run start` (use `--android`, `--ios`, or `--web` as needed).
3. Configure Firebase keys in `app.config.ts` extras or environment variables before shipping.

## Feature map
- **Splash screen**: Configured via `app.config.ts` with `assets/splash.png`.
- **Auth**: Email/password flows handled in `src/context/AuthContext.tsx` and screens under `src/screens`.
- **Walkthrough**: Three slide demo after registering (`WalkthroughScreen`).
- **Design schema**: `src/data/designSchema.ts` is the canonical JSON schema for layout + theme tokens, reused by the UI.
- **Notifications**: Expo push registration and in-app notification rendering (`src/services/notifications.ts`, `NotificationPanel`). API-triggered notifications are fetched from `NOTIFICATION_ENDPOINT`.
- **Preferences**: Theme and notification preferences persisted with AsyncStorage (`PreferencesContext`).
- **Webhook**: Status buttons POST driver + route UUID payloads (`useStatusWebhook`).

## Types and data
The `.trashed-app-snippets` directory mirrors the administrative schema. Driver app domain types live in `src/types` and are informed by that dataset (route UUIDs, status enums, etc.).
