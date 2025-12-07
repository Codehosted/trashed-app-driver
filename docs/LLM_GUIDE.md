# Trashed Driver App – LLM Handoff Guide

This repository is an Expo-managed React Native app targeting Android, iOS, and web. It implements Firebase authentication, Expo push messaging, a post-registration walkthrough, webhook callbacks for status updates, and persists user preferences.

## Key entry points
- `app.config.ts`: Expo manifest including splash, icons, and platform targets.
- `App.tsx`: Navigation container with SplashScreen handling, routes, and provider wiring.
- `src/context/AuthContext.tsx`: Firebase auth lifecycle, register/login/reset flows, walkthrough gating.
- `src/context/PreferencesContext.tsx`: Theme + notification preferences stored via AsyncStorage.
- `src/screens/*`: UI for login, register, reset, walkthrough, and the main home dashboard.
- `src/services/notifications.ts`: Expo push registration, local notifications, and API-triggered notification helper.
- `src/hooks/useStatusWebhook.ts`: Posts driver + route UUID payloads to the webhook endpoint when status buttons are used.
- `src/data/designSchema.ts`: JSON schema describing layout, theme palettes (light/dark), walkthrough slides, and sample route data used across screens.

## Firebase
Configure runtime keys in `app.config.ts` extras or via environment injection. The default values mirror the existing project IDs but use `REPLACE_ME` for the API key. Auth uses email/password for login, register, and reset.

## Notifications
Expo push uses `expo-notifications`. The app auto-registers for push tokens on load (see `usePushRegistration`). Notification cards render in-app messages returned from the configured API endpoint. Update `NOTIFICATION_ENDPOINT` and `WEBHOOK_ENDPOINT` in `src/screens/HomeScreen.tsx` to your environment.

## Status webhooks
The “Status webhooks” buttons on the Home screen POST `{ driverUuid, routeUuid, status }` to the configured webhook endpoint, satisfying the driver + route payload requirement.

## Theming and schema
The `designSchema` file is the single source of truth for light/dark palettes, layout blueprints, and walkthrough slide content. Screens reference it to ensure consistent styling tokens.
