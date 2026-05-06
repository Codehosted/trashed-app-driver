import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  TextInput,
  Switch,
  Image,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Animated, { SlideInRight, SlideOutRight } from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { useAuth } from '@/context/AuthContext';
import { usePreferences } from '@/context/PreferencesContext';
import { designSchema } from '@/data/designSchema';
import { NotificationPreferences } from '@/types/domain';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { BrandLogo } from '@/components/BrandLogo';

const PROFILE_STORAGE_KEY = 'driver_profile';

interface DriverProfile {
  vehicleModel: string;
  licensePlate: string;
  phoneNumber: string;
}

export const ProfileScreen: React.FC = () => {
  const navigation = useNavigation();
  const { user, logout } = useAuth();
  const { theme, notificationPreferences, updateNotificationPreferences, updateTheme } = usePreferences();
  const palette = designSchema.theme[theme];
  const isDark = theme === 'dark';

  const [driverData, setDriverData] = useState<DriverProfile>({
    vehicleModel: '',
    licensePlate: '',
    phoneNumber: '',
  });
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);
  const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const isInitialLoadRef = useRef(true);

  // Load profile data
  useEffect(() => {
    const loadProfile = async () => {
      try {
        const stored = await AsyncStorage.getItem(PROFILE_STORAGE_KEY);
        if (stored) {
          const data = JSON.parse(stored);
          setDriverData({
            vehicleModel: data.vehicleModel || '',
            licensePlate: data.licensePlate || '',
            phoneNumber: data.phoneNumber || '',
          });
        }
      } catch (err) {
        console.error('Error loading profile:', err);
      } finally {
        isInitialLoadRef.current = false;
      }
    };
    loadProfile();
  }, []);

  // Auto-save function with debouncing
  const autoSave = useCallback(async (data: DriverProfile) => {
    // Clear existing timeout
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
    }

    // Don't save on initial load
    if (isInitialLoadRef.current) {
      return;
    }

    // Debounce save operation
    saveTimeoutRef.current = setTimeout(async () => {
      try {
        await AsyncStorage.setItem(PROFILE_STORAGE_KEY, JSON.stringify(data));
        setToast({ message: 'Settings saved', type: 'success' });
        setTimeout(() => setToast(null), 3000);
      } catch (err) {
        console.error('Error saving profile:', err);
        setToast({ message: 'Failed to save settings', type: 'error' });
        setTimeout(() => setToast(null), 3000);
      }
    }, 500);
  }, []);

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }
    };
  }, []);

  const togglePref = (key: keyof NotificationPreferences) => {
    const newPrefs = {
      ...notificationPreferences,
      [key]: !notificationPreferences[key],
    };
    updateNotificationPreferences(newPrefs);
    // Auto-save notification preferences
    autoSave(driverData);
  };

  const handleThemeToggle = () => {
    updateTheme(theme === 'dark' ? 'light' : 'dark');
    // Auto-save when theme changes
    autoSave(driverData);
  };

  const handleDriverDataChange = (updates: Partial<DriverProfile>) => {
    const newData = { ...driverData, ...updates };
    setDriverData(newData);
    autoSave(newData);
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: palette.background }]} edges={['top', 'bottom']}>
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.contentContainer}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.header}>
          <Pressable
            onPress={() => navigation.goBack()}
            style={[
              styles.backButton,
              {
                backgroundColor: isDark ? 'rgba(51, 65, 85, 0.5)' : 'rgba(203, 213, 225, 0.5)',
              },
            ]}
          >
            <Ionicons name="arrow-back" size={20} color={palette.text} />
          </Pressable>
          <View style={styles.headerCopy}>
            <BrandLogo
              textColor={palette.text}
              accentColor={palette.accent}
              mutedColor={palette.subtleText}
              size="sm"
              subtitle="SETTINGS"
            />
            <Text style={[styles.headerTitle, { color: palette.text }]}>
              {user ? 'Profile & preferences' : 'App settings'}
            </Text>
          </View>
        </View>

        {/* Profile Card */}
        <View
          style={[
            styles.card,
            {
              backgroundColor: isDark ? 'rgba(15, 23, 42, 0.8)' : 'rgba(255, 255, 255, 0.9)',
              borderColor: isDark ? 'rgba(51, 65, 85, 0.7)' : 'rgba(203, 213, 225, 1)',
            },
          ]}
        >
          {/* User Info */}
          <View style={styles.userSection}>
            <View
              style={[
                styles.avatarContainer,
                {
                  borderColor: palette.accent,
                  backgroundColor: isDark ? 'rgba(51, 65, 85, 0.5)' : 'rgba(203, 213, 225, 0.5)',
                },
              ]}
            >
              {user?.photoURL ? (
                <Image source={{ uri: user.photoURL }} style={styles.avatar} />
              ) : (
                <Ionicons
                  name={user ? 'person' : 'settings'}
                  size={32}
                  color={isDark ? '#64748b' : '#94a3b8'}
                />
              )}
            </View>
            <View style={styles.userInfo}>
              <Text style={[styles.userName, { color: palette.text }]}>
                {user ? user.displayName || 'Driver' : 'Guest Driver'}
              </Text>
              <Text style={[styles.userEmail, { color: palette.subtleText }]}>
                {user ? user.email : 'Local Session'}
              </Text>
              {user && (
                <View
                  style={[
                    styles.userIdBadge,
                    {
                      backgroundColor: `${palette.accent}20`,
                    },
                  ]}
                >
                  <Text style={[styles.userIdText, { color: palette.accent }]}>
                    ID: {user.uid.slice(0, 8)}...
                  </Text>
                </View>
              )}
            </View>
          </View>

          {/* Vehicle Details */}
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <Ionicons name="car" size={18} color={palette.accent} />
              <Text style={[styles.sectionTitle, { color: palette.text }]}>Vehicle Details</Text>
            </View>

            <View style={styles.inputRow}>
              <View style={styles.inputContainer}>
                <Text style={[styles.label, { color: palette.subtleText }]}>Vehicle Model</Text>
                <TextInput
                  style={[
                    styles.input,
                    {
                      backgroundColor: isDark ? 'rgba(15, 23, 42, 0.5)' : 'rgba(248, 250, 252, 1)',
                      color: palette.text,
                      borderColor: isDark ? 'rgba(51, 65, 85, 0.7)' : 'rgba(203, 213, 225, 1)',
                    },
                  ]}
                  value={driverData.vehicleModel}
                  onChangeText={(text) => handleDriverDataChange({ vehicleModel: text })}
                  placeholder="e.g. Ford Transit 2022"
                  placeholderTextColor={palette.subtleText}
                />
              </View>
              <View style={styles.inputContainer}>
                <Text style={[styles.label, { color: palette.subtleText }]}>License Plate</Text>
                <TextInput
                  style={[
                    styles.input,
                    {
                      backgroundColor: isDark ? 'rgba(15, 23, 42, 0.5)' : 'rgba(248, 250, 252, 1)',
                      color: palette.text,
                      borderColor: isDark ? 'rgba(51, 65, 85, 0.7)' : 'rgba(203, 213, 225, 1)',
                    },
                  ]}
                  value={driverData.licensePlate}
                  onChangeText={(text) => handleDriverDataChange({ licensePlate: text })}
                  placeholder="e.g. ABC-1234"
                  placeholderTextColor={palette.subtleText}
                />
              </View>
            </View>

            <View style={styles.inputContainer}>
              <Text style={[styles.label, { color: palette.subtleText }]}>Phone Number</Text>
                <TextInput
                  style={[
                    styles.input,
                    {
                      backgroundColor: isDark ? 'rgba(15, 23, 42, 0.5)' : 'rgba(248, 250, 252, 1)',
                      color: palette.text,
                      borderColor: isDark ? 'rgba(51, 65, 85, 0.7)' : 'rgba(203, 213, 225, 1)',
                    },
                  ]}
                  value={driverData.phoneNumber}
                  onChangeText={(text) => handleDriverDataChange({ phoneNumber: text })}
                  placeholder="+1 (555) 000-0000"
                  placeholderTextColor={palette.subtleText}
                  keyboardType="phone-pad"
                />
            </View>
          </View>

          {/* Notification Settings */}
          <View style={[styles.section, styles.sectionDivider]}>
            <View style={styles.sectionHeader}>
              <Ionicons name="notifications" size={18} color={palette.accent} />
              <Text style={[styles.sectionTitle, { color: palette.text }]}>Notification Settings</Text>
            </View>

            <View
              style={[
                styles.preferenceItem,
                {
                  backgroundColor: isDark ? 'rgba(51, 65, 85, 0.3)' : 'rgba(248, 250, 252, 1)',
                },
              ]}
            >
              <View style={styles.preferenceInfo}>
                <Text style={[styles.preferenceLabel, { color: palette.text }]}>Route Alerts</Text>
                <Text style={[styles.preferenceDescription, { color: palette.subtleText }]}>
                  Get notified when new stops are added.
                </Text>
              </View>
              <Switch
                value={notificationPreferences.routeAlerts}
                onValueChange={() => togglePref('routeAlerts')}
                thumbColor={notificationPreferences.routeAlerts ? palette.accent : '#94a3b8'}
                trackColor={{ false: '#cbd5e1', true: `${palette.accent}40` }}
              />
            </View>

            <View
              style={[
                styles.preferenceItem,
                {
                  backgroundColor: isDark ? 'rgba(51, 65, 85, 0.3)' : 'rgba(248, 250, 252, 1)',
                },
              ]}
            >
              <View style={styles.preferenceInfo}>
                <Text style={[styles.preferenceLabel, { color: palette.text }]}>Beta Features</Text>
                <Text style={[styles.preferenceDescription, { color: palette.subtleText }]}>
                  Enable experimental features.
                </Text>
              </View>
              <Switch
                value={notificationPreferences.betaFeatures}
                onValueChange={() => togglePref('betaFeatures')}
                thumbColor={notificationPreferences.betaFeatures ? palette.accent : '#94a3b8'}
                trackColor={{ false: '#cbd5e1', true: `${palette.accent}40` }}
              />
            </View>
          </View>

          {/* Theme Settings */}
          <View style={[styles.section, styles.sectionDivider]}>
            <View style={styles.sectionHeader}>
              <Ionicons
                name={theme === 'dark' ? 'moon' : 'sunny'}
                size={18}
                color={palette.accent}
              />
              <Text style={[styles.sectionTitle, { color: palette.text }]}>Appearance</Text>
            </View>

            <View
              style={[
                styles.preferenceItem,
                {
                  backgroundColor: isDark ? 'rgba(51, 65, 85, 0.3)' : 'rgba(248, 250, 252, 1)',
                },
              ]}
            >
              <View style={styles.preferenceInfo}>
                <Text style={[styles.preferenceLabel, { color: palette.text }]}>Theme</Text>
                <Text style={[styles.preferenceDescription, { color: palette.subtleText }]}>
                  Switch between light and dark mode.
                </Text>
              </View>
              <Switch
                value={theme === 'dark'}
                onValueChange={handleThemeToggle}
                thumbColor={theme === 'dark' ? palette.accent : '#94a3b8'}
                trackColor={{ false: '#cbd5e1', true: `${palette.accent}40` }}
              />
            </View>
          </View>

          {/* Sign Out Button */}
          {user && (
            <View style={styles.actions}>
              <Pressable
                style={[
                  styles.signOutButton,
                  {
                    borderColor: isDark ? 'rgba(51, 65, 85, 0.7)' : 'rgba(203, 213, 225, 1)',
                  },
                ]}
                onPress={logout}
              >
                <Text style={[styles.signOutText, { color: palette.text }]}>Sign Out</Text>
              </Pressable>
            </View>
          )}
        </View>
      </ScrollView>

      {/* Toast Notification */}
      {toast && (
        <Animated.View
          entering={SlideInRight}
          exiting={SlideOutRight}
          style={styles.toastContainer}
          pointerEvents="box-none"
        >
          <View
            style={[
              styles.toast,
              {
                backgroundColor: isDark ? 'rgba(15, 23, 42, 0.95)' : 'rgba(255, 255, 255, 0.95)',
                borderColor: isDark ? 'rgba(51, 65, 85, 0.7)' : 'rgba(203, 213, 225, 1)',
              },
            ]}
          >
            <View
              style={[
                styles.toastIcon,
                {
                  backgroundColor:
                    toast.type === 'success'
                      ? `${palette.success}20`
                      : `${palette.danger}20`,
                },
              ]}
            >
              <Ionicons
                name={toast.type === 'success' ? 'checkmark-circle' : 'alert-circle'}
                size={20}
                color={toast.type === 'success' ? palette.success : palette.danger}
              />
            </View>
            <Text
              style={[
                styles.toastText,
                {
                  color: toast.type === 'success' ? palette.success : palette.danger,
                },
              ]}
            >
              {toast.message}
            </Text>
            <Pressable
              onPress={() => setToast(null)}
              style={styles.toastClose}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            >
              <Ionicons name="close" size={16} color={palette.subtleText} />
            </Pressable>
          </View>
        </Animated.View>
      )}
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  scrollView: {
    flex: 1,
  },
  contentContainer: {
    padding: 16,
    paddingBottom: 32,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 18,
    gap: 12,
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerCopy: {
    flex: 1,
    gap: 8,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: '800',
  },
  card: {
    borderRadius: 20,
    padding: 18,
    borderWidth: 1,
    gap: 20,
  },
  userSection: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
    paddingBottom: 24,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(51, 65, 85, 0.3)',
  },
  avatarContainer: {
    width: 80,
    height: 80,
    borderRadius: 40,
    borderWidth: 2,
    justifyContent: 'center',
    alignItems: 'center',
    overflow: 'hidden',
  },
  avatar: {
    width: '100%',
    height: '100%',
  },
  userInfo: {
    flex: 1,
    gap: 4,
  },
  userName: {
    fontSize: 20,
    fontWeight: 'bold',
  },
  userEmail: {
    fontSize: 14,
  },
  userIdBadge: {
    alignSelf: 'flex-start',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 10,
    marginTop: 4,
  },
  userIdText: {
    fontSize: 10,
    fontFamily: 'monospace',
    fontWeight: '600',
  },
  section: {
    gap: 16,
  },
  sectionDivider: {
    paddingTop: 24,
    borderTopWidth: 1,
    borderTopColor: 'rgba(51, 65, 85, 0.3)',
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 8,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
  },
  inputRow: {
    flexDirection: 'column',
    gap: 12,
  },
  inputContainer: {
    flex: 1,
    gap: 8,
  },
  label: {
    fontSize: 12,
    fontWeight: '500',
  },
  input: {
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    fontSize: 14,
  },
  preferenceItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 14,
    borderRadius: 16,
    marginBottom: 8,
  },
  preferenceInfo: {
    flex: 1,
    gap: 4,
  },
  preferenceLabel: {
    fontSize: 14,
    fontWeight: '600',
  },
  preferenceDescription: {
    fontSize: 11,
  },
  actions: {
    gap: 12,
    marginTop: 8,
  },
  signOutButton: {
    padding: 15,
    borderRadius: 16,
    borderWidth: 1,
    alignItems: 'center',
  },
  signOutText: {
    fontSize: 16,
    fontWeight: '600',
  },
  toastContainer: {
    position: 'absolute',
    bottom: 24,
    left: 0,
    right: 0,
    alignItems: 'flex-start',
    zIndex: 1000,
    paddingHorizontal: 16,
  },
  toast: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    width: '100%',
    maxWidth: 400,
    padding: 14,
    borderRadius: 12,
    borderWidth: 1,
    shadowOffset: { width: 0, height: 4 },
    shadowRadius: 12,
    shadowOpacity: 0.2,
    elevation: 8,
  },
  toastIcon: {
    width: 32,
    height: 32,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
  },
  toastText: {
    flex: 1,
    fontSize: 14,
    fontWeight: '600',
  },
  toastClose: {
    padding: 4,
  },
});
