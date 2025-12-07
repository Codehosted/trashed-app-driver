import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable, Switch } from 'react-native';
import { useAuth } from '@/context/AuthContext';
import { usePreferences } from '@/context/PreferencesContext';
import { designSchema } from '@/data/designSchema';
import { NotificationPanel } from '@/components/NotificationPanel';
import { fetchAndDisplayNotification, NotificationPayload } from '@/services/notifications';
import { usePushRegistration } from '@/hooks/usePushRegistration';
import { useStatusWebhook } from '@/hooks/useStatusWebhook';
import { designSchema as schema } from '@/data/designSchema';

const NOTIFICATION_ENDPOINT = 'https://example.com/api/driver/notifications';
const WEBHOOK_ENDPOINT = 'https://example.com/api/driver/status-webhook';

export const HomeScreen: React.FC = () => {
  const { logout, user } = useAuth();
  const { theme, notificationPreferences, updateNotificationPreferences, updateTheme } = usePreferences();
  const palette = designSchema.theme[theme];
  const push = usePushRegistration();
  const sendWebhook = useStatusWebhook(WEBHOOK_ENDPOINT);
  const [notifications, setNotifications] = useState<NotificationPayload[]>([]);
  const route = schema.sampleRoute;

  useEffect(() => {
    (async () => {
      const payload = await fetchAndDisplayNotification(NOTIFICATION_ENDPOINT);
      if (payload) {
        setNotifications((prev) => [payload, ...prev]);
      }
    })();
  }, []);

  const togglePreference = async (key: keyof typeof notificationPreferences) => {
    await updateNotificationPreferences({ ...notificationPreferences, [key]: !notificationPreferences[key] });
  };

  const updateStatus = async (status: 'in_progress' | 'arrived' | 'completed') => {
    if (!user) return;
    await sendWebhook({ driverUuid: user.uid, routeUuid: route.uuid, status });
  };

  return (
    <ScrollView style={{ backgroundColor: palette.background }} contentContainerStyle={{ padding: 20, gap: 16 }}>
      <Text style={[styles.title, { color: palette.text }]}>Detroit Loop</Text>
      <Text style={{ color: palette.subtleText }}>{route.dispatcherNote}</Text>

      <View style={[styles.card, { backgroundColor: palette.card }]}>
        <Text style={[styles.sectionTitle, { color: palette.text }]}>Stops</Text>
        {route.stops.map((stop) => (
          <View key={stop.uuid} style={styles.stopRow}>
            <View>
              <Text style={{ color: palette.text, fontWeight: '600' }}>{stop.name}</Text>
              <Text style={{ color: palette.subtleText }}>{stop.address}</Text>
            </View>
            <View style={[styles.badge, { backgroundColor: palette.accent }]}> 
              <Text style={{ color: '#fff', fontWeight: '700' }}>{stop.status}</Text>
            </View>
          </View>
        ))}
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
        <Text style={[styles.sectionTitle, { color: palette.text }]}>Status webhooks</Text>
        <View style={{ flexDirection: 'row', gap: 10 }}>
          <Pressable style={[styles.button, { backgroundColor: palette.accent }]} onPress={() => updateStatus('in_progress')}>
            <Text style={styles.buttonText}>En route</Text>
          </Pressable>
          <Pressable style={[styles.button, { backgroundColor: palette.success }]} onPress={() => updateStatus('arrived')}>
            <Text style={styles.buttonText}>Arrived</Text>
          </Pressable>
          <Pressable style={[styles.button, { backgroundColor: palette.warning }]} onPress={() => updateStatus('completed')}>
            <Text style={styles.buttonText}>Completed</Text>
          </Pressable>
        </View>
        <Text style={{ color: palette.subtleText, marginTop: 8 }}>
          Webhook payload includes driver uuid and route uuid as required.
        </Text>
      </View>

      <NotificationPanel notifications={notifications} />

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
  card: {
    borderRadius: 16,
    padding: 16,
    gap: 12,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '700',
  },
  stopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 6,
  },
  badge: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 20,
  },
  preferenceRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  button: {
    padding: 10,
    borderRadius: 10,
  },
  buttonText: {
    color: '#0b172a',
    fontWeight: '700',
  },
  logout: {
    borderWidth: 1,
    padding: 12,
    borderRadius: 12,
    alignItems: 'center',
  },
});
