import React from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable, Switch } from 'react-native';
import { useAuth } from '@/context/AuthContext';
import { usePreferences } from '@/context/PreferencesContext';
import { designSchema } from '@/data/designSchema';
import { usePushRegistration } from '@/hooks/usePushRegistration';

export const HomeScreen: React.FC = () => {
  const { logout, user } = useAuth();
  const { theme, notificationPreferences, updateNotificationPreferences, updateTheme } = usePreferences();
  const palette = designSchema.theme[theme];
  const push = usePushRegistration();

  const togglePreference = async (key: keyof typeof notificationPreferences) => {
    await updateNotificationPreferences({ ...notificationPreferences, [key]: !notificationPreferences[key] });
  };

  return (
    <ScrollView style={{ backgroundColor: palette.background }} contentContainerStyle={{ padding: 20, gap: 16 }}>
      <View>
        <Text style={[styles.title, { color: palette.text }]}>Driver settings</Text>
        <Text style={[styles.subtitle, { color: palette.subtleText }]}>
          {user?.email ?? 'Signed in driver'}
        </Text>
      </View>

      <View style={[styles.card, { backgroundColor: palette.card }]}> 
        <Text style={[styles.sectionTitle, { color: palette.text }]}>Preferences</Text>
        <View style={styles.preferenceRow}>
          <Text style={{ color: palette.text }}>Theme</Text>
          <Pressable onPress={() => updateTheme(theme === 'light' ? 'dark' : 'light')}>
            <Text style={{ color: palette.accent }}>{theme === 'light' ? 'Switch to dark' : 'Switch to light'}</Text>
          </Pressable>
        </View>
        <View style={styles.preferenceRow}>
          <Text style={{ color: palette.text }}>Route alerts</Text>
          <Switch
            value={notificationPreferences.routeAlerts}
            onValueChange={() => togglePreference('routeAlerts')}
            thumbColor={palette.accent}
          />
        </View>
        <View style={styles.preferenceRow}>
          <Text style={{ color: palette.text }}>Beta features</Text>
          <Switch
            value={notificationPreferences.betaFeatures}
            onValueChange={() => togglePreference('betaFeatures')}
            thumbColor={palette.accent}
          />
        </View>
      </View>

      <View style={[styles.card, { backgroundColor: palette.card }]}> 
        <Text style={[styles.sectionTitle, { color: palette.text }]}>Push registration</Text>
        <Text style={{ color: palette.subtleText }}>Status: {push.status}</Text>
        {push.pushToken ? <Text style={{ color: palette.text }}>Token: {push.pushToken}</Text> : null}
      </View>

      <Pressable style={[styles.logout, { borderColor: palette.accent }]} onPress={logout}>
        <Text style={{ color: palette.accent }}>Logout</Text>
      </Pressable>
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  title: {
    fontSize: 26,
    fontWeight: '700',
  },
  subtitle: {
    marginTop: 4,
    fontSize: 14,
  },
  card: {
    borderRadius: 16,
    padding: 16,
    gap: 12,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '700',
  },
  preferenceRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  logout: {
    borderWidth: 1,
    padding: 12,
    borderRadius: 12,
    alignItems: 'center',
  },
});
