import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  TextInput,
  Switch,
  Image,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { useAuth } from '@/context/AuthContext';
import { usePreferences } from '@/context/PreferencesContext';
import { designSchema } from '@/data/designSchema';
import { NotificationPreferences } from '@/types/domain';
import AsyncStorage from '@react-native-async-storage/async-storage';

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

  const [loading, setLoading] = useState(false);
  const [driverData, setDriverData] = useState<DriverProfile>({
    vehicleModel: '',
    licensePlate: '',
    phoneNumber: '',
  });
  const [message, setMessage] = useState('');

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
      }
    };
    loadProfile();
  }, []);

  const handleSave = async () => {
    setLoading(true);
    try {
      await AsyncStorage.setItem(PROFILE_STORAGE_KEY, JSON.stringify(driverData));
      setMessage('Settings saved successfully!');
      setTimeout(() => setMessage(''), 3000);
    } catch (err) {
      console.error('Error saving profile:', err);
      setMessage('Failed to save settings.');
    }
    setLoading(false);
  };

  const togglePref = (key: keyof NotificationPreferences) => {
    updateNotificationPreferences({
      ...notificationPreferences,
      [key]: !notificationPreferences[key],
    });
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: palette.background }]} edges={['top', 'bottom']}>
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.contentContainer}
        showsVerticalScrollIndicator={false}
      >
        {/* Header */}
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
          <Text style={[styles.headerTitle, { color: palette.text }]}>
            {user ? 'Driver Profile' : 'App Settings'}
          </Text>
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
                  onChangeText={(text) => setDriverData({ ...driverData, vehicleModel: text })}
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
                  onChangeText={(text) => setDriverData({ ...driverData, licensePlate: text })}
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
                onChangeText={(text) => setDriverData({ ...driverData, phoneNumber: text })}
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

            <View style={styles.preferenceItem}>
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

            <View style={styles.preferenceItem}>
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

            <View style={styles.preferenceItem}>
              <View style={styles.preferenceInfo}>
                <Text style={[styles.preferenceLabel, { color: palette.text }]}>Theme</Text>
                <Text style={[styles.preferenceDescription, { color: palette.subtleText }]}>
                  Switch between light and dark mode.
                </Text>
              </View>
              <Switch
                value={theme === 'dark'}
                onValueChange={() => updateTheme(theme === 'dark' ? 'light' : 'dark')}
                thumbColor={theme === 'dark' ? palette.accent : '#94a3b8'}
                trackColor={{ false: '#cbd5e1', true: `${palette.accent}40` }}
              />
            </View>
          </View>

          {/* Message */}
          {message && (
            <View
              style={[
                styles.message,
                {
                  backgroundColor: message.includes('success')
                    ? 'rgba(16, 185, 129, 0.1)'
                    : 'rgba(239, 68, 68, 0.1)',
                },
              ]}
            >
              <Text
                style={[
                  styles.messageText,
                  {
                    color: message.includes('success') ? '#10b981' : '#ef4444',
                  },
                ]}
              >
                {message}
              </Text>
            </View>
          )}

          {/* Action Buttons */}
          <View style={styles.actions}>
            <Pressable
              style={[
                styles.saveButton,
                {
                  backgroundColor: palette.accent,
                  opacity: loading ? 0.5 : 1,
                },
              ]}
              onPress={handleSave}
              disabled={loading}
            >
              {loading ? (
                <ActivityIndicator color="#ffffff" />
              ) : (
                <>
                  <Ionicons name="save" size={18} color="#ffffff" />
                  <Text style={styles.saveButtonText}>Save Changes</Text>
                </>
              )}
            </Pressable>

            {user && (
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
            )}
          </View>
        </View>
      </ScrollView>
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
    alignItems: 'center',
    marginBottom: 24,
    gap: 12,
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: 'bold',
  },
  card: {
    borderRadius: 24,
    padding: 24,
    borderWidth: 1,
    gap: 24,
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
    borderRadius: 4,
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
    flexDirection: 'row',
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
    padding: 16,
    borderRadius: 12,
    backgroundColor: 'rgba(15, 23, 42, 0.3)',
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
  message: {
    padding: 12,
    borderRadius: 12,
    marginTop: 8,
  },
  messageText: {
    fontSize: 12,
    fontWeight: '600',
  },
  actions: {
    gap: 12,
    marginTop: 8,
  },
  saveButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    padding: 16,
    borderRadius: 12,
  },
  saveButtonText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: 'bold',
  },
  signOutButton: {
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: 'center',
  },
  signOutText: {
    fontSize: 16,
    fontWeight: '600',
  },
});

