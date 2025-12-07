import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

interface WeatherWidgetProps {
  theme: 'dark' | 'light';
}

export const WeatherWidget: React.FC<WeatherWidgetProps> = ({ theme }) => {
  const isDark = theme === 'dark';

  return (
    <View
      style={[
        styles.container,
        {
          backgroundColor: isDark ? 'rgba(15, 23, 42, 0.8)' : 'rgba(255, 255, 255, 0.8)',
          borderColor: isDark ? 'rgba(51, 65, 85, 0.7)' : 'rgba(203, 213, 225, 1)',
        },
      ]}
    >
      <View style={styles.textSection}>
        <Text
          style={[
            styles.location,
            {
              color: isDark ? 'rgba(255, 255, 255, 0.7)' : 'rgba(15, 23, 42, 0.7)',
            },
          ]}
        >
          Detroit, MI
        </Text>
        <Text
          style={[
            styles.temperature,
            {
              color: isDark ? '#ffffff' : '#0f172a',
            },
          ]}
        >
          72°
        </Text>
      </View>
      <View
        style={[
          styles.divider,
          {
            backgroundColor: isDark ? 'rgba(255, 255, 255, 0.2)' : 'rgba(15, 23, 42, 0.2)',
          },
        ]}
      />
      <Ionicons name="partly-sunny" size={18} color="#f59e0b" />
      <View style={styles.details}>
        <View style={styles.detailRow}>
          <Ionicons name="water" size={9} color={isDark ? 'rgba(255, 255, 255, 0.7)' : 'rgba(15, 23, 42, 0.7)'} />
          <Text
            style={[
              styles.detailText,
              {
                color: isDark ? 'rgba(255, 255, 255, 0.7)' : 'rgba(15, 23, 42, 0.7)',
              },
            ]}
          >
            8 mph
          </Text>
        </View>
        <View style={styles.detailRow}>
          <Ionicons name="rainy" size={9} color={isDark ? 'rgba(255, 255, 255, 0.7)' : 'rgba(15, 23, 42, 0.7)'} />
          <Text
            style={[
              styles.detailText,
              {
                color: isDark ? 'rgba(255, 255, 255, 0.7)' : 'rgba(15, 23, 42, 0.7)',
              },
            ]}
          >
            12%
          </Text>
        </View>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: 1,
    shadowOffset: { width: 0, height: 2 },
    shadowRadius: 8,
    shadowOpacity: 0.1,
    elevation: 3,
  },
  textSection: {
    alignItems: 'flex-end',
  },
  location: {
    fontSize: 9,
    fontWeight: '500',
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  temperature: {
    fontSize: 16,
    fontWeight: 'bold',
    lineHeight: 20,
  },
  divider: {
    width: 1,
    height: 24,
  },
  details: {
    gap: 2,
  },
  detailRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  detailText: {
    fontSize: 9,
  },
});

