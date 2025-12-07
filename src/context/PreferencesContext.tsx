import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { ThemeMode, NotificationPreferences } from '@/types/domain';

interface PreferencesValue {
  theme: ThemeMode;
  notificationPreferences: NotificationPreferences;
  updateTheme: (next: ThemeMode) => Promise<void>;
  updateNotificationPreferences: (next: NotificationPreferences) => Promise<void>;
}

const DEFAULT_PREFS: NotificationPreferences = {
  routeAlerts: true,
  marketing: false,
  betaFeatures: true,
};

const PreferencesContext = createContext<PreferencesValue | undefined>(undefined);

const PREF_KEY = 'driver_preferences';

export const PreferencesProvider: React.FC<{ children: React.ReactNode }> = ({ children }: { children: React.ReactNode }) => {
  const [theme, setTheme] = useState<ThemeMode>('light');
  const [notificationPreferences, setNotificationPreferences] = useState<NotificationPreferences>(DEFAULT_PREFS);

  useEffect(() => {
    (async () => {
      const raw = await AsyncStorage.getItem(PREF_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as PreferencesValue;
        setTheme(parsed.theme);
        setNotificationPreferences(parsed.notificationPreferences);
      }
    })();
  }, []);

  const persist = async (nextTheme: ThemeMode, prefs: NotificationPreferences) => {
    await AsyncStorage.setItem(PREF_KEY, JSON.stringify({ theme: nextTheme, notificationPreferences: prefs }));
  };

  const updateTheme = async (next: ThemeMode) => {
    setTheme(next);
    await persist(next, notificationPreferences);
  };

  const updateNotificationPreferences = async (next: NotificationPreferences) => {
    setNotificationPreferences(next);
    await persist(theme, next);
  };

  const value = useMemo(
    () => ({ theme, notificationPreferences, updateTheme, updateNotificationPreferences }),
    [theme, notificationPreferences]
  );

  return <PreferencesContext.Provider value={value}>{children}</PreferencesContext.Provider>;
};

export const usePreferences = () => {
  const ctx = useContext(PreferencesContext);
  if (!ctx) throw new Error('usePreferences must be used within PreferencesProvider');
  return ctx;
};
