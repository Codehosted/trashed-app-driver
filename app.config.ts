import type { ExpoConfig } from 'expo/config';
import { existsSync } from 'fs';
import { resolve } from 'path';

const firebaseConfig = {
  apiKey: "AIzaSyCupPwEn9r0APIZUnTtHP0pdscyLGtd3Lc",
  authDomain: "trashed-app.firebaseapp.com",
  projectId: "trashed-app",
  storageBucket: "trashed-app.firebasestorage.app",
  messagingSenderId: "151975222689",
  appId: "1:151975222689:web:5790cbfd70a060e1a9bfe0",
  measurementId: "G-3YFJ783W78"
};

// Check if Google Services files exist
const iosGoogleServicesFile = './GoogleService-Info.plist';
const androidGoogleServicesFile = './google-services.json';
const iosGoogleServicesExists = existsSync(resolve(__dirname, iosGoogleServicesFile));
const androidGoogleServicesExists = existsSync(resolve(__dirname, androidGoogleServicesFile));

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
    backgroundColor: '#0b172a'
  },
  ios: {
    "infoPlist": {
      "ITSAppUsesNonExemptEncryption": false,
      "UIViewControllerBasedStatusBarAppearance": false,
      "UIStatusBarHidden": true
    },
    supportsTablet: true,
    bundleIdentifier: 'com.trashed.driver',
    googleServicesFile: iosGoogleServicesFile
  },
  android: {
    package: 'com.trashed.driver',
    adaptiveIcon: {
      foregroundImage: './assets/adaptive-icon.png',
      backgroundColor: '#0b172a'
    },
    ...(androidGoogleServicesExists && { googleServicesFile: androidGoogleServicesFile })
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
    '@react-native-firebase/app',
    '@react-native-firebase/auth',
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
    firebaseApiKey: firebaseConfig.apiKey,
    firebaseAuthDomain: firebaseConfig.authDomain,
    firebaseProjectId: firebaseConfig.projectId,
    firebaseStorageBucket: firebaseConfig.storageBucket,
    firebaseMessagingSenderId: firebaseConfig.messagingSenderId,
    firebaseAppId: firebaseConfig.appId,
    // Authentication toggle: Set to false to bypass login and go directly to the dashboard
    // When false, users can navigate the app without authentication
    enableAuth: process.env.ENABLE_AUTH === 'true' || true, // Can be set via env var
    // Backend API base URL for NextAuth and backend services (separate from web mobile app)
    // Use environment variable or fallback to default
    apiBaseUrl: process.env.API_BASE_URL || 'https://trashed.ngrok.app',
    // Web mobile app URL - used by WebView on all platforms
    // Use environment variable or fallback to production URL
    webAppUrl: process.env.WEB_APP_URL || 'https://trashed-app-driver.vercel.app/',
  }
};

export default config;
