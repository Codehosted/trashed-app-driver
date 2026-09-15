import type { CapacitorConfig } from '@capacitor/cli';

// TestFlight/default: wrap the production Trashed app.
// Dev: run cap:sync:ios:dev or override TRASHED_WEB_URL before cap sync.
const serverUrl = process.env.TRASHED_WEB_URL ?? 'https://trashed.app';

const config: CapacitorConfig = {
  appId: 'com.trashed.driver',
  appName: 'Trashed',
  // Capacitor debug bridges log full plugin arguments, including exported transcripts.
  loggingBehavior: 'none',
  // webDir points at the Vite dist — only used when serverUrl is not set (local native testing)
  webDir: 'dist',
  server: {
    // Load the role-aware Next.js app entry. The /app route is session-gated;
    // Capacitor passes cookies automatically via the WebView.
    url: `${serverUrl}/app?source=trashed-app`,
    androidScheme: 'https',
    cleartext: !serverUrl.startsWith('https://'),
    // Keep all same-host navigation inside the WebView (login redirects, etc.)
    allowNavigation: [`${new URL(serverUrl).hostname}`],
  },
  android: {
    allowMixedContent: true,
    useLegacyBridge: true,
  },
  plugins: {
    PushNotifications: {
      presentationOptions: ['badge', 'sound', 'alert'],
    },
    SplashScreen: {
      launchShowDuration: 900,
      backgroundColor: '#020617',
      androidSplashResourceName: 'splash',
      showSpinner: false,
    },
  },
};

export default config;
