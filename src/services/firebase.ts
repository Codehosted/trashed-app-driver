// Firebase service - Auth removed, using backend API instead
// Firestore kept optional for data storage (can be removed later if using backend API)

import { Platform } from 'react-native';

// React Native Firebase Firestore (optional, for data storage)
let rnFirestore: any;

// Lazy load React Native Firebase Firestore to avoid bundler issues
const getRnFirestore = () => {
  if (Platform.OS === 'web') return null;
  try {
    if (!rnFirestore) {
      rnFirestore = require('@react-native-firebase/firestore').default;
    }
    return rnFirestore;
  } catch (e) {
    console.warn('@react-native-firebase/firestore not available:', e);
    return null;
  }
};

// For web platform, use the standard Firebase SDK (Firestore only)
let webFirestore: any;
if (Platform.OS === 'web') {
  try {
    const { initializeApp } = require('firebase/app');
    const { getFirestore } = require('firebase/firestore');
    const Constants = require('expo-constants');

    const getFirebaseConfig = () => {
      const extra = Constants.expoConfig?.extra;
      if (!extra) {
        throw new Error('Expo config extra section is missing. Check app.config.ts');
      }

      const config = {
        apiKey: extra.firebaseApiKey,
        authDomain: extra.firebaseAuthDomain,
        projectId: extra.firebaseProjectId,
        storageBucket: extra.firebaseStorageBucket,
        messagingSenderId: extra.firebaseMessagingSenderId,
        appId: extra.firebaseAppId,
      };

      const missingFields = Object.entries(config)
        .filter(([_, value]) => !value || value === 'REPLACE_ME')
        .map(([key]) => key);

      if (missingFields.length > 0) {
        throw new Error(
          `Missing or incomplete Firebase configuration in app.config.ts: ${missingFields.join(', ')}`
        );
      }

      return config;
    };

    const firebaseConfig = getFirebaseConfig();
    const app = initializeApp(firebaseConfig);
    webFirestore = getFirestore(app);
  } catch (e) {
    console.warn('Firebase web Firestore not available:', e);
  }
}

// Export Firestore instance (optional - can be removed if using backend API)
export const db = (() => {
  if (Platform.OS === 'web') {
    return webFirestore;
  }
  const firestoreModule = getRnFirestore();
  if (!firestoreModule) {
    return null;
  }
  return firestoreModule();
})();

// User type - compatible with backend API
export interface User {
  uid: string;
  email: string | null;
  displayName: string | null;
  photoURL: string | null;
  [key: string]: any;
}
