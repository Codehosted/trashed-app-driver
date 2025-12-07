import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';

// User type - will be replaced with backend API types
export interface User {
  uid: string;
  email: string | null;
  displayName: string | null;
  photoURL: string | null;
  [key: string]: any;
}

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
const USER_STORAGE_KEY = 'driver_user';

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

  // Load user from storage on mount
  useEffect(() => {
    const loadUser = async () => {
      if (!authEnabled) {
        setLoading(false);
        setNeedsWalkthrough(false);
        return;
      }

      try {
        const storedUser = await AsyncStorage.getItem(USER_STORAGE_KEY);
        if (storedUser) {
          const userData = JSON.parse(storedUser);
          setUser(userData);
          const seen = await AsyncStorage.getItem(`${WALKTHROUGH_KEY}:${userData.uid}`);
          setNeedsWalkthrough(!seen);
        }
      } catch (err) {
        console.error('Error loading user:', err);
      } finally {
        setLoading(false);
      }
    };

    loadUser();
  }, [authEnabled]);

  const register = async (email: string, password: string) => {
    if (!authEnabled) {
      throw new Error('Authentication is disabled');
    }
    // TODO: Replace with backend API call
    // const response = await fetch('YOUR_BACKEND_API/register', { ... });
    // const userData = await response.json();
    
    // Placeholder: Create a mock user for now
    const mockUser: User = {
      uid: `user_${Date.now()}`,
      email,
      displayName: email.split('@')[0],
      photoURL: null,
    };
    
    setUser(mockUser);
    await AsyncStorage.setItem(USER_STORAGE_KEY, JSON.stringify(mockUser));
    await AsyncStorage.removeItem(`${WALKTHROUGH_KEY}:${mockUser.uid}`);
    setNeedsWalkthrough(true);
  };

  const login = async (email: string, password: string) => {
    if (!authEnabled) {
      throw new Error('Authentication is disabled');
    }
    // TODO: Replace with backend API call
    // const response = await fetch('YOUR_BACKEND_API/login', { ... });
    // const userData = await response.json();
    
    // Placeholder: Create a mock user for now
    const mockUser: User = {
      uid: `user_${Date.now()}`,
      email,
      displayName: email.split('@')[0],
      photoURL: null,
    };
    
    setUser(mockUser);
    await AsyncStorage.setItem(USER_STORAGE_KEY, JSON.stringify(mockUser));
    const seen = await AsyncStorage.getItem(`${WALKTHROUGH_KEY}:${mockUser.uid}`);
    setNeedsWalkthrough(!seen);
  };

  const resetPassword = async (email: string) => {
    if (!authEnabled) {
      throw new Error('Authentication is disabled');
    }
    // TODO: Replace with backend API call
    // await fetch('YOUR_BACKEND_API/reset-password', { ... });
    throw new Error('Password reset not implemented yet. Use backend API.');
  };

  const logout = async () => {
    if (!authEnabled) {
      return;
    }
    // TODO: Call backend API to invalidate session if needed
    // await fetch('YOUR_BACKEND_API/logout', { ... });
    
    setUser(null);
    await AsyncStorage.removeItem(USER_STORAGE_KEY);
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
