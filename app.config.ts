import type { ExpoConfig } from 'expo/config';
const firebaseConfig = {
  apiKey: "AIzaSyCupPwEn9r0APIZUnTtHP0pdscyLGtd3Lc",
  authDomain: "trashed-app.firebaseapp.com",
  projectId: "trashed-app",
  storageBucket: "trashed-app.firebasestorage.app",
  messagingSenderId: "151975222689",
  appId: "1:151975222689:web:5790cbfd70a060e1a9bfe0",
  measurementId: "G-3YFJ783W78"
};
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
    supportsTablet: true,
    bundleIdentifier: 'com.trashed.driver'
  },
  android: {
    package: 'com.trashed.driver',
    adaptiveIcon: {
      foregroundImage: './assets/adaptive-icon.png',
      backgroundColor: '#0b172a'
    }
  },
  web: {
    bundler: 'metro',
    favicon: './assets/favicon.png'
  },
  experiments: {
    typedRoutes: true
  },
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
    // When false, users can navigate the app without Firebase authentication
    enableAuth: false, // Set to true to require authentication
  }
};

export default config;
