import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  Switch,
  Image,
  Pressable,
  ActivityIndicator,
  ScrollView,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { User } from '@/context/AuthContext';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { designSchema } from '@/data/designSchema';
import { ThemeMode, NotificationPreferences } from '@/types/domain';

interface ProfileCardProps {
  user: User | null;
  onSignOut?: () => void;
  onTestNotification?: () => void;
  theme: ThemeMode;
  onToggleTheme: () => void;
}

interface DriverData {
  vehicleModel: string;
  licensePlate: string;
  phoneNumber: string;
}

interface LegacyNotificationPreferences extends NotificationPreferences {
  newAssignments?: boolean;
  routeChanges?: boolean;
  etaAlerts?: boolean;
}

const PROFILE_STORAGE_KEY = 'driver_profile';

export const ProfileCard: React.FC<ProfileCardProps> = ({
  user,
  onSignOut,
  onTestNotification,
  theme,
  onToggleTheme,
}) => {
  const palette = designSchema.theme[theme];
  const isDark = theme === 'dark';

  const [loading, setLoading] = useState(false);
  const [driverData, setDriverData] = useState<DriverData>({
    vehicleModel: '',
    licensePlate: '',
    phoneNumber: '',
  });
  const [notificationPrefs, setNotificationPrefs] = useState<LegacyNotificationPreferences>({
    newAssignments: true,
    routeChanges: true,
    etaAlerts: false,
    routeAlerts: true,
    marketing: false,
    betaFeatures: false,
  });
  const [message, setMessage] = useState('');

  // Load Data on Mount
  useEffect(() => {
    const fetchProfile = async () => {
      if (user) {
        // AUTHENTICATED MODE: Fetch from backend API or AsyncStorage
        // TODO: Replace with backend API call
        // try {
        //   const response = await fetch(`YOUR_BACKEND_API/drivers/${user.uid}`);
        //   const data = await response.json();
        //   setDriverData({ ... });
        // } catch (err) { ... }
        
        // For now, use AsyncStorage with user-specific key
        try {
          const storedSettings = await AsyncStorage.getItem(`${PROFILE_STORAGE_KEY}:${user.uid}`);
          if (storedSettings) {
            const data = JSON.parse(storedSettings);
            setDriverData({
              vehicleModel: data.vehicleModel || '',
              licensePlate: data.licensePlate || '',
              phoneNumber: data.phoneNumber || '',
            });
            if (data.notificationPreferences) {
              setNotificationPrefs({
                ...notificationPrefs,
                ...data.notificationPreferences,
              });
            }
          }
        } catch (err) {
          console.error('Error loading profile:', err);
        }
      } else {
        // GUEST MODE: Fetch from AsyncStorage
        try {
          const storedSettings = await AsyncStorage.getItem(PROFILE_STORAGE_KEY);
          if (storedSettings) {
            const data = JSON.parse(storedSettings);
            setDriverData({
              vehicleModel: data.vehicleModel || '',
              licensePlate: data.licensePlate || '',
              phoneNumber: data.phoneNumber || '',
            });
            if (data.notificationPreferences) {
              setNotificationPrefs({
                ...notificationPrefs,
                ...data.notificationPreferences,
              });
            }
          }
        } catch (err) {
          console.error('Error loading local settings:', err);
        }
      }
    };
    fetchProfile();
  }, [user]);

  // Save Data
  const handleSave = async () => {
    setLoading(true);
    try {
      if (user) {
        // AUTHENTICATED MODE: Save to backend API
        // TODO: Replace with backend API call
        // await fetch(`YOUR_BACKEND_API/drivers/${user.uid}`, {
        //   method: 'PUT',
        //   headers: { 'Content-Type': 'application/json' },
        //   body: JSON.stringify({
        //     ...driverData,
        //     notificationPreferences: notificationPrefs,
        //   }),
        // });
        
        // For now, save to AsyncStorage with user-specific key
        const settingsToSave = {
          vehicleModel: driverData.vehicleModel,
          licensePlate: driverData.licensePlate,
          phoneNumber: driverData.phoneNumber,
          notificationPreferences: notificationPrefs,
          email: user.email,
          displayName: user.displayName,
          updatedAt: new Date().toISOString(),
        };
        await AsyncStorage.setItem(`${PROFILE_STORAGE_KEY}:${user.uid}`, JSON.stringify(settingsToSave));
      } else {
        // GUEST MODE: Save to AsyncStorage
        const settingsToSave = {
          vehicleModel: driverData.vehicleModel,
          licensePlate: driverData.licensePlate,
          phoneNumber: driverData.phoneNumber,
          notificationPreferences: notificationPrefs,
        };
        await AsyncStorage.setItem(PROFILE_STORAGE_KEY, JSON.stringify(settingsToSave));
      }

      setMessage('Settings saved successfully!');
      setTimeout(() => setMessage(''), 3000);
    } catch (err) {
      console.error('Error saving settings:', err);
      setMessage('Failed to save settings.');
    }
    setLoading(false);
  };

  const togglePref = (key: keyof LegacyNotificationPreferences) => {
    setNotificationPrefs((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  return (
    <ScrollView
      style={[styles.container, { backgroundColor: palette.background }]}
      contentContainerStyle={styles.contentContainer}
      showsVerticalScrollIndicator={false}
    >
      <View
        style={[
          styles.card,
          {
            backgroundColor: isDark ? 'rgba(15, 23, 42, 0.8)' : 'rgba(255, 255, 255, 0.9)',
            borderColor: isDark ? 'rgba(51, 65, 85, 0.7)' : 'rgba(203, 213, 225, 1)',
          },
        ]}
      >
        {/* User Info Readonly */}
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
            {user && user.photoURL ? (
              <Image source={{ uri: user.photoURL }} style={styles.avatar} />
            ) : (
              <Ionicons
                name={user ? 'person' : 'settings'}
                size={40}
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

        {/* Vehicle Form */}
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
          <View style={styles.sectionHeaderRow}>
            <View style={styles.sectionHeader}>
              <Ionicons name="notifications" size={18} color={palette.accent} />
              <Text style={[styles.sectionTitle, { color: palette.text }]}>
                Notification Settings
              </Text>
            </View>
            {onTestNotification && (
              <Pressable
                onPress={onTestNotification}
                style={[
                  styles.testButton,
                  {
                    backgroundColor: isDark ? 'rgba(51, 65, 85, 0.5)' : 'rgba(203, 213, 225, 0.5)',
                  },
                ]}
              >
                <Text style={[styles.testButtonText, { color: palette.text }]}>Test Alert</Text>
              </Pressable>
            )}
          </View>

          <View style={styles.preferenceItem}>
            <View style={styles.preferenceInfo}>
              <Text style={[styles.preferenceLabel, { color: palette.text }]}>New Assignments</Text>
              <Text style={[styles.preferenceDescription, { color: palette.subtleText }]}>
                Get notified when new stops are added.
              </Text>
            </View>
            <Switch
              value={notificationPrefs.newAssignments ?? false}
              onValueChange={() => togglePref('newAssignments')}
              thumbColor={notificationPrefs.newAssignments ? palette.accent : '#94a3b8'}
              trackColor={{ false: '#cbd5e1', true: `${palette.accent}40` }}
            />
          </View>

          <View style={styles.preferenceItem}>
            <View style={styles.preferenceInfo}>
              <Text style={[styles.preferenceLabel, { color: palette.text }]}>Route Changes</Text>
              <Text style={[styles.preferenceDescription, { color: palette.subtleText }]}>
                Alerts for route optimizations or cancellations.
              </Text>
            </View>
            <Switch
              value={notificationPrefs.routeChanges ?? false}
              onValueChange={() => togglePref('routeChanges')}
              thumbColor={notificationPrefs.routeChanges ? palette.accent : '#94a3b8'}
              trackColor={{ false: '#cbd5e1', true: `${palette.accent}40` }}
            />
          </View>

          <View style={styles.preferenceItem}>
            <View style={styles.preferenceInfo}>
              <Text style={[styles.preferenceLabel, { color: palette.text }]}>ETA Alerts</Text>
              <Text style={[styles.preferenceDescription, { color: palette.subtleText }]}>
                Notifications for arrival time updates.
              </Text>
            </View>
            <Switch
              value={notificationPrefs.etaAlerts ?? false}
              onValueChange={() => togglePref('etaAlerts')}
              thumbColor={notificationPrefs.etaAlerts ? palette.accent : '#94a3b8'}
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
              onValueChange={onToggleTheme}
              thumbColor={theme === 'dark' ? palette.accent : '#94a3b8'}
              trackColor={{ false: '#cbd5e1', true: `${palette.accent}40` }}
            />
          </View>
        </View>

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

          {user && onSignOut && (
            <Pressable
              style={[
                styles.signOutButton,
                {
                  borderColor: isDark ? 'rgba(51, 65, 85, 0.7)' : 'rgba(203, 213, 225, 1)',
                },
              ]}
              onPress={onSignOut}
            >
              <Text style={[styles.signOutText, { color: palette.text }]}>Sign Out</Text>
            </Pressable>
          )}
        </View>
      </View>
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  contentContainer: {
    padding: 16,
    paddingBottom: 32,
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
  sectionHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
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
    marginRight: 12,
  },
  preferenceLabel: {
    fontSize: 14,
    fontWeight: '600',
  },
  preferenceDescription: {
    fontSize: 11,
  },
  testButton: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
  },
  testButtonText: {
    fontSize: 12,
    fontWeight: '600',
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

