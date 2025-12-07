import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { designSchema } from '@/data/designSchema';
import { usePreferences } from '@/context/PreferencesContext';
import { NotificationPayload } from '@/services/notifications';

interface Props {
  notifications: NotificationPayload[];
}

export const NotificationPanel: React.FC<Props> = ({ notifications }: Props) => {
  const { theme } = usePreferences();
  const palette = designSchema.theme[theme];

  return (
    <View style={[styles.container, { backgroundColor: palette.card }]}> 
      <Text style={[styles.title, { color: palette.text }]}>In-app notifications</Text>
      {notifications.map((notification) => (
        <View key={notification.id} style={[styles.item, { borderColor: palette.accent }]}> 
          <Text style={[styles.itemTitle, { color: palette.text }]}>{notification.title}</Text>
          <Text style={[styles.itemBody, { color: palette.subtleText }]}>{notification.body}</Text>
        </View>
      ))}
      {notifications.length === 0 && (
        <Text style={{ color: palette.subtleText }}>No notifications yet.</Text>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    padding: 16,
    borderRadius: 12,
    gap: 10,
  },
  title: {
    fontSize: 16,
    fontWeight: '600',
  },
  item: {
    borderWidth: 1,
    padding: 10,
    borderRadius: 10,
  },
  itemTitle: {
    fontWeight: '700',
  },
  itemBody: {
    marginTop: 4,
    lineHeight: 18,
  },
});
