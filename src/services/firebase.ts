import { initializeApp } from 'firebase/app';
import {
  getAuth,
  initializeAuth,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  sendPasswordResetEmail,
  signOut,
  User,
  type Auth
} from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';
import { Platform } from 'react-native';

// Get Firebase config from app.config.ts (single source of truth)
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

  // Validate required fields
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

// Initialize Auth with AsyncStorage persistence for React Native
// For Firebase v9+, we need to use initializeAuth with React Native persistence
let auth: Auth;
if (Platform.OS !== 'web') {
  try {
    // React Native: Check if we can use getReactNativePersistence
    // This may require a different import or Firebase version
    // For now, try initializeAuth - if it fails, fall back to getAuth
    const { getReactNativePersistence } = require('firebase/auth/react-native');
    auth = initializeAuth(app, {
      persistence: getReactNativePersistence(AsyncStorage)
    });
  } catch (error: any) {
    // If initializeAuth fails or getReactNativePersistence doesn't exist,
    // fall back to getAuth (auth will still work, just with memory persistence warning)
    if (error.code === 'auth/already-initialized' || error.message?.includes('Cannot find module')) {
      auth = getAuth(app);
    } else {
      // Try getAuth as fallback
      auth = getAuth(app);
    }
  }
} else {
  // Web: use getAuth
  auth = getAuth(app);
}

export { auth };
export const db = getFirestore(app);

export {
  onAuthStateChanged,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  sendPasswordResetEmail,
  signOut,
  type User
};
