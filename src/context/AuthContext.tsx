import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import {
  auth,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  sendPasswordResetEmail,
  signOut,
  User,
} from '@/services/firebase';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';

interface AuthContextValue {
  user: User | null;
  loading: boolean;
  needsWalkthrough: boolean;
  isAuthEnabled: boolean;
  register: (email: string, password: string) => Promise<void>;
  login: (email: string, password: string) => Promise<void>;
  resetPassword: (email: string) => Promise<void>;
  logout: () => Promise<void>;
  completeWalkthrough: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

const WALKTHROUGH_KEY = 'driver_walkthrough_complete';

// Check if auth is enabled from config
const isAuthEnabled = () => {
  const enableAuth = Constants.expoConfig?.extra?.enableAuth;
  return enableAuth === true;
};

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }: { children: React.ReactNode }) => {
  const authEnabled = isAuthEnabled();
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(authEnabled);
  const [needsWalkthrough, setNeedsWalkthrough] = useState(false);

  useEffect(() => {
    if (!authEnabled) {
      // Auth disabled - immediately mark as loaded
      setLoading(false);
      setNeedsWalkthrough(false);
      return;
    }

    const unsubscribe = onAuthStateChanged(auth, async (nextUser) => {
      setUser(nextUser);
      if (nextUser) {
        const seen = await AsyncStorage.getItem(`${WALKTHROUGH_KEY}:${nextUser.uid}`);
        setNeedsWalkthrough(!seen);
      }
      setLoading(false);
    });

    return () => unsubscribe();
  }, [authEnabled]);

  const register = async (email: string, password: string) => {
    if (!authEnabled) {
      throw new Error('Authentication is disabled');
    }
    const credential = await createUserWithEmailAndPassword(auth, email, password);
    setUser(credential.user);
    await AsyncStorage.removeItem(`${WALKTHROUGH_KEY}:${credential.user.uid}`);
    setNeedsWalkthrough(true);
  };

  const login = async (email: string, password: string) => {
    if (!authEnabled) {
      throw new Error('Authentication is disabled');
    }
    const credential = await signInWithEmailAndPassword(auth, email, password);
    setUser(credential.user);
    const seen = await AsyncStorage.getItem(`${WALKTHROUGH_KEY}:${credential.user.uid}`);
    setNeedsWalkthrough(!seen);
  };

  const resetPassword = (email: string) => {
    if (!authEnabled) {
      throw new Error('Authentication is disabled');
    }
    return sendPasswordResetEmail(auth, email);
  };

  const logout = async () => {
    if (!authEnabled) {
      return;
    }
    await signOut(auth);
    setUser(null);
  };

  const completeWalkthrough = async () => {
    if (authEnabled && user) {
      await AsyncStorage.setItem(`${WALKTHROUGH_KEY}:${user.uid}`, 'true');
    }
    setNeedsWalkthrough(false);
  };

  const value = useMemo<AuthContextValue>(
    () => ({ user, loading, needsWalkthrough, isAuthEnabled: authEnabled, register, login, resetPassword, logout, completeWalkthrough }),
    [user, loading, needsWalkthrough, authEnabled]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export const useAuth = () => {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
};
