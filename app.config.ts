import type { ExpoConfig } from 'expo/config';

const config: ExpoConfig = {
  name: 'Trashed Driver',
  slug: 'trashed-driver',
  owner: 'codehosted-cloud',
  scheme: 'trasheddriver',
  version: '1.0.0',
  orientation: 'portrait',
  platforms: ['ios', 'android', 'web'],
  icon: './assets/icon.png',
  splash: {
    image: './assets/splash.png',
    resizeMode: 'contain',
    backgroundColor: '#f4f7fb'
  },
  ios: {
    "infoPlist": {
      "ITSAppUsesNonExemptEncryption": false,
      "UIViewControllerBasedStatusBarAppearance": false,
      "UIStatusBarHidden": true
    },
    supportsTablet: true,
    bundleIdentifier: 'com.trashed.driver'
  },
  android: {
    package: 'com.trashed.driver',
    adaptiveIcon: {
      foregroundImage: './assets/adaptive-icon.png',
      backgroundColor: '#f4f7fb'
    }
  },
  web: {
    bundler: 'metro',
    favicon: './assets/favicon.png'
  },
  experiments: {
    typedRoutes: true
  },
  plugins: [
    'expo-font',
    [
      'expo-build-properties',
      {
        ios: {
          useFrameworks: 'static'
        }
      }
    ]
  ],
  extra: {
    eas: {
      projectId: '1804841b-3977-429b-af4a-849ba0657920'
    },
    // Authentication toggle: Set to false to bypass login and go directly to the dashboard
    // When false, users can navigate the app without authentication
    enableAuth: process.env.ENABLE_AUTH === 'true' || true, // Can be set via env var
    // Backend API base URL for NextAuth and backend services (separate from web mobile app)
    // Use environment variable or fallback to default
    apiBaseUrl: process.env.API_BASE_URL || 'https://trashed.ngrok.app',
    // Web mobile app URL - used by WebView on all platforms
    // Use environment variable or fallback to production URL
    webAppUrl: process.env.WEB_APP_URL || 'https://trashed-app-driver.vercel.app/'
  }
};

export default config;
