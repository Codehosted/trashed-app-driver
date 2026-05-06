import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

type DockItemKey = 'orders' | 'map' | 'messages' | 'settings';
type IoniconName = React.ComponentProps<typeof Ionicons>['name'];

type MobileDockProps = {
  active: DockItemKey;
  accentColor: string;
  textColor: string;
  mutedColor: string;
  surfaceColor: string;
  borderColor: string;
  messageCount?: number;
  onOrders: () => void;
  onMap: () => void;
  onMessages: () => void;
  onSettings: () => void;
};

const ITEMS: Array<{
  key: DockItemKey;
  label: string;
  icon: IoniconName;
}> = [
  { key: 'orders', label: 'Orders', icon: 'calendar-clear-outline' },
  { key: 'map', label: 'Map', icon: 'navigate-outline' },
  { key: 'messages', label: 'Messages', icon: 'chatbubble-ellipses-outline' },
  { key: 'settings', label: 'Settings', icon: 'person-outline' },
];

export const MobileDock: React.FC<MobileDockProps> = ({
  active,
  accentColor,
  textColor,
  mutedColor,
  surfaceColor,
  borderColor,
  messageCount = 0,
  onOrders,
  onMap,
  onMessages,
  onSettings,
}) => {
  const insets = useSafeAreaInsets();
  const handlers: Record<DockItemKey, () => void> = {
    orders: onOrders,
    map: onMap,
    messages: onMessages,
    settings: onSettings,
  };

  return (
    <View style={[styles.outer, { paddingBottom: Math.max(insets.bottom, 8) }]}>
      <View style={[styles.dock, { backgroundColor: surfaceColor, borderColor }]}>
        {ITEMS.map((item) => {
          const selected = active === item.key;
          return (
            <Pressable
              key={item.key}
              accessibilityRole="button"
              accessibilityLabel={item.label}
              onPress={handlers[item.key]}
              style={[
                styles.item,
                selected && { backgroundColor: `${accentColor}14` },
              ]}
            >
              <View style={styles.iconWrap}>
                <Ionicons
                  name={item.icon}
                  size={20}
                  color={selected ? accentColor : mutedColor}
                />
                {item.key === 'messages' && messageCount > 0 ? (
                  <View style={[styles.badge, { backgroundColor: accentColor }]}>
                    <Text style={styles.badgeText}>{Math.min(messageCount, 9)}</Text>
                  </View>
                ) : null}
              </View>
              <Text
                style={[
                  styles.label,
                  { color: selected ? textColor : mutedColor },
                ]}
                numberOfLines={1}
              >
                {item.label}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  outer: {
    paddingHorizontal: 14,
    paddingTop: 8,
  },
  dock: {
    minHeight: 64,
    borderRadius: 24,
    borderWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    padding: 6,
  },
  item: {
    flex: 1,
    minHeight: 52,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 3,
  },
  iconWrap: {
    position: 'relative',
    minWidth: 24,
    alignItems: 'center',
  },
  badge: {
    position: 'absolute',
    top: -7,
    right: -8,
    minWidth: 16,
    height: 16,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
  },
  badgeText: {
    color: '#ffffff',
    fontSize: 10,
    fontWeight: '800',
  },
  label: {
    fontSize: 10,
    fontWeight: '700',
  },
});
