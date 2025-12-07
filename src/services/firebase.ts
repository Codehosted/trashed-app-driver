import { initializeApp } from 'firebase/app';
import {
  getAuth,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  sendPasswordResetEmail,
  signOut,
  User
} from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';
import Constants from 'expo-constants';

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

export const auth = getAuth(app);
export const db = getFirestore(app);

export {
  onAuthStateChanged,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  sendPasswordResetEmail,
  signOut,
  type User
};
