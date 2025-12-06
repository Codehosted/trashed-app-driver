import { initializeApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider, onAuthStateChanged, signOut, signInWithPopup, type User } from 'firebase/auth';
import { getFirestore, doc, getDoc, setDoc } from 'firebase/firestore';
import { getMessaging, getToken, onMessage, type Messaging } from 'firebase/messaging';

const firebaseConfig = {
  apiKey: "AIzaSyCupPwEn9r0APIZUnTtHP0pdscyLGtd3Lc",
  authDomain: "trashed-app.firebaseapp.com",
  projectId: "trashed-app",
  storageBucket: "trashed-app.firebasestorage.app",
  messagingSenderId: "151975222689",
  appId: "1:151975222689:web:5790cbfd70a060e1a9bfe0",
  measurementId: "G-3YFJ783W78"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);

// Initialize services
export const auth = getAuth(app);
export const db = getFirestore(app);
export const googleProvider = new GoogleAuthProvider();

// Initialize messaging (only in browser, not in Node.js)
let messaging: Messaging | null = null;
if (typeof window !== 'undefined' && 'serviceWorker' in navigator) {
  try {
    messaging = getMessaging(app);
  } catch (error) {
    console.warn('Firebase Messaging initialization failed:', error);
  }
}

// Request notification permission and get token
export const requestNotificationPermission = async (): Promise<string | null> => {
  if (!messaging) {
    console.warn('Messaging is not available');
    return null;
  }

  try {
    const permission = await Notification.requestPermission();
    if (permission === 'granted') {
      // VAPID key is optional - Firebase will use the one configured in the console if not provided
      const token = await getToken(messaging);
      if (token) {
        console.log('FCM Token:', token);
        return token;
      } else {
        console.warn('No registration token available. Make sure you have configured Firebase Cloud Messaging in the Firebase Console.');
        return null;
      }
    } else {
      console.warn('Notification permission denied.');
      return null;
    }
  } catch (error) {
    console.error('Error requesting notification permission:', error);
    return null;
  }
};

// Listen for foreground messages
export const onMessageListener = () =>
  new Promise((resolve) => {
    if (!messaging) {
      resolve(null);
      return;
    }
    
    onMessage(messaging, (payload) => {
      resolve(payload);
    });
  });

// Re-export Firebase functions for convenience
export { onAuthStateChanged, signOut, signInWithPopup, doc, getDoc, setDoc };
