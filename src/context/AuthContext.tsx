import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';
import * as authService from '@/services/auth';
import type { NextAuthUser } from '@/services/auth';
import { userDataEmitter, USER_DATA_UPDATED_EVENT } from '@/services/api-response-handler';

// User type - compatible with NextAuth user
export interface User {
  uid: string; // Maps to uuid from NextAuth
  email: string | null;
  displayName: string | null; // Maps to name from NextAuth
  photoURL: string | null; // Maps to image from NextAuth
  id?: string;
  uuid?: string;
  roles?: string[];
  vendor?: any;
  vendorPermissions?: any;
  emailVerified?: Date | null;
  phone?: string | null;
  [key: string]: any;
}

/**
 * Convert NextAuthUser to User format for compatibility
 */
function nextAuthUserToUser(nextAuthUser: NextAuthUser): User {
  return {
    uid: nextAuthUser.uuid,
    email: nextAuthUser.email,
    displayName: nextAuthUser.name,
    photoURL: nextAuthUser.image,
    id: nextAuthUser.id,
    uuid: nextAuthUser.uuid,
    roles: nextAuthUser.roles,
    vendor: nextAuthUser.vendor,
    vendorPermissions: nextAuthUser.vendorPermissions,
    emailVerified: nextAuthUser.emailVerified,
    phone: nextAuthUser.phone,
  };
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

  // Load user from session on mount and refresh periodically
  useEffect(() => {
    const loadUser = async () => {
      if (!authEnabled) {
        setLoading(false);
        setNeedsWalkthrough(false);
        return;
      }

      try {
        // Check for existing session
        const sessionResponse = await authService.getSession();
        if (sessionResponse.success && sessionResponse.user) {
          const user = nextAuthUserToUser(sessionResponse.user);
          setUser(user);
          await AsyncStorage.setItem(USER_STORAGE_KEY, JSON.stringify(user));
          const seen = await AsyncStorage.getItem(`${WALKTHROUGH_KEY}:${user.uid}`);
          setNeedsWalkthrough(!seen);
        } else {
          // Check for stored user as fallback
          const storedUser = await AsyncStorage.getItem(USER_STORAGE_KEY);
          if (storedUser) {
            const userData = JSON.parse(storedUser);
            setUser(userData);
            const seen = await AsyncStorage.getItem(`${WALKTHROUGH_KEY}:${userData.uid}`);
            setNeedsWalkthrough(!seen);
          }
        }
      } catch (err) {
        console.error('Error loading user:', err);
      } finally {
        setLoading(false);
      }
    };

    loadUser();
    
    // Listen for user data updates from API responses
    const handleUserDataUpdate = async () => {
      try {
        const storedUser = await AsyncStorage.getItem(USER_STORAGE_KEY);
        if (storedUser) {
          const userData = JSON.parse(storedUser);
          setUser(userData);
          const seen = await AsyncStorage.getItem(`${WALKTHROUGH_KEY}:${userData.uid}`);
          setNeedsWalkthrough(!seen);
        } else {
          setUser(null);
        }
      } catch (err) {
        console.error('Error refreshing user data:', err);
      }
    };
    
    userDataEmitter.on(USER_DATA_UPDATED_EVENT, handleUserDataUpdate);
    
    return () => {
      userDataEmitter.off(USER_DATA_UPDATED_EVENT, handleUserDataUpdate);
    };
  }, [authEnabled]);

  const register = async (email: string, password: string) => {
    if (!authEnabled) {
      throw new Error('Authentication is disabled');
    }
    
    const result = await authService.register(email, password);
    if (!result.success || !result.user) {
      throw new Error(result.error || 'Registration failed');
    }
    
    const user = nextAuthUserToUser(result.user);
    setUser(user);
    await AsyncStorage.setItem(USER_STORAGE_KEY, JSON.stringify(user));
    await AsyncStorage.removeItem(`${WALKTHROUGH_KEY}:${user.uid}`);
    setNeedsWalkthrough(true);
  };

  const login = async (email: string, password: string) => {
    if (!authEnabled) {
      throw new Error('Authentication is disabled');
    }
    
    const result = await authService.login(email, password);
    if (!result.success || !result.user) {
      throw new Error(result.error || 'Login failed');
    }
    
    const user = nextAuthUserToUser(result.user);
    setUser(user);
    await AsyncStorage.setItem(USER_STORAGE_KEY, JSON.stringify(user));
    const seen = await AsyncStorage.getItem(`${WALKTHROUGH_KEY}:${user.uid}`);
    setNeedsWalkthrough(!seen);
  };

  const resetPassword = async (email: string) => {
    if (!authEnabled) {
      throw new Error('Authentication is disabled');
    }
    
    const result = await authService.requestPasswordReset(email);
    if (!result.success) {
      throw new Error(result.error || 'Failed to send password reset email');
    }
  };

  const logout = async () => {
    if (!authEnabled) {
      return;
    }
    
    await authService.logout();
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
