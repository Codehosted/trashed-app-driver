import React from 'react';
import { View, Text, StyleSheet, Pressable, ScrollView, Modal } from 'react-native';
import Animated, { SlideInRight, SlideOutRight } from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';
import { RouteStop } from '@/types/domain';

interface ListViewProps {
  stops: RouteStop[];
  activeIndex: number;
  onSelect: (index: number) => void;
  onClose: () => void;
  theme: 'dark' | 'light';
}

const getIconName = (type?: string) => {
  switch (type) {
    case 'idea':
      return 'bulb';
    case 'time':
      return 'time';
    case 'email':
      return 'mail';
    case 'chart':
      return 'trending-up';
    case 'star':
      return 'star';
    case 'rocket':
      return 'rocket';
    default:
      return 'location';
  }
};

export const ListView: React.FC<ListViewProps> = ({
  stops,
  activeIndex,
  onSelect,
  onClose,
  theme,
}) => {
  const isDark = theme === 'dark';

  return (
    <Modal visible={true} transparent animationType="none" onRequestClose={onClose}>
      <Pressable style={styles.overlay} onPress={onClose}>
        <Animated.View
          entering={SlideInRight}
          exiting={SlideOutRight}
          style={[
            styles.container,
            {
              backgroundColor: isDark ? 'rgba(15, 23, 42, 0.95)' : 'rgba(255, 255, 255, 0.95)',
              borderLeftColor: isDark ? 'rgba(51, 65, 85, 0.8)' : 'rgba(203, 213, 225, 1)',
            },
          ]}
          onStartShouldSetResponder={() => true}
        >
          <View
            style={[
              styles.header,
              {
                backgroundColor: isDark ? 'rgba(15, 23, 42, 0.5)' : 'rgba(248, 250, 252, 0.5)',
                borderBottomColor: isDark ? 'rgba(51, 65, 85, 0.8)' : 'rgba(203, 213, 225, 1)',
              },
            ]}
          >
            <Text
              style={[
                styles.headerTitle,
                {
                  color: isDark ? '#ffffff' : '#0f172a',
                },
              ]}
            >
              Today's Route
            </Text>
            <Pressable
              onPress={onClose}
              style={[
                styles.closeButton,
                {
                  backgroundColor: isDark ? 'transparent' : 'transparent',
                },
              ]}
            >
              <Ionicons
                name="close"
                size={20}
                color={isDark ? 'rgba(148, 163, 184, 1)' : 'rgba(100, 116, 139, 1)'}
              />
            </Pressable>
          </View>

          <ScrollView
            style={styles.scrollView}
            contentContainerStyle={styles.scrollContent}
            showsVerticalScrollIndicator={false}
          >
            {stops.map((stop, i) => {
              const isActive = i === activeIndex;
              const color = stop.color || '#64748b';

              return (
                <Pressable
                  key={stop.uuid}
                  onPress={() => onSelect(i)}
                  style={[
                    styles.stopCard,
                    {
                      backgroundColor: isActive
                        ? isDark
                          ? 'rgba(99, 102, 241, 0.2)'
                          : 'rgba(238, 242, 255, 0.5)'
                        : isDark
                        ? 'rgba(15, 23, 42, 0.5)'
                        : '#ffffff',
                      borderColor: isActive
                        ? '#6366f1'
                        : isDark
                        ? 'rgba(51, 65, 85, 0.8)'
                        : 'rgba(203, 213, 225, 1)',
                      borderWidth: isActive ? 2 : 1,
                    },
                  ]}
                >
                  <View
                    style={[
                      styles.stopIcon,
                      {
                        backgroundColor: color,
                      },
                    ]}
                  >
                    <Ionicons name={getIconName(stop.type) as any} size={18} color="#ffffff" />
                  </View>
                  <View style={styles.stopContent}>
                    <View style={styles.stopHeader}>
                      <Text
                        style={[
                          styles.stopNumber,
                          {
                            color: isDark ? 'rgba(148, 163, 184, 1)' : 'rgba(100, 116, 139, 1)',
                          },
                        ]}
                      >
                        Stop {i + 1}
                      </Text>
                      {stop.scheduledAt && (
                        <Text
                          style={[
                            styles.stopTime,
                            {
                              color: isDark ? 'rgba(148, 163, 184, 1)' : 'rgba(100, 116, 139, 1)',
                            },
                          ]}
                        >
                          • {stop.scheduledAt}
                        </Text>
                      )}
                    </View>
                    <Text
                      style={[
                        styles.stopTitle,
                        {
                          color: isDark ? '#f1f5f9' : '#0f172a',
                        },
                      ]}
                    >
                      {stop.name || stop.title}
                    </Text>
                    {stop.description && (
                      <Text
                        style={[
                          styles.stopDescription,
                          {
                            color: isDark ? 'rgba(148, 163, 184, 1)' : 'rgba(71, 85, 105, 1)',
                          },
                        ]}
                      >
                        {stop.description}
                      </Text>
                    )}
                  </View>
                </Pressable>
              );
            })}
          </ScrollView>
        </Animated.View>
      </Pressable>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
  },
  container: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    width: '100%',
    maxWidth: 384,
    borderLeftWidth: 1,
    shadowOffset: { width: -4, height: 0 },
    shadowRadius: 12,
    shadowOpacity: 0.3,
    elevation: 10,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 24,
    borderBottomWidth: 1,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: 'bold',
  },
  closeButton: {
    padding: 8,
    borderRadius: 20,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: 16,
    gap: 12,
  },
  stopCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 16,
    padding: 16,
    borderRadius: 12,
    shadowOffset: { width: 0, height: 2 },
    shadowRadius: 4,
    shadowOpacity: 0.1,
    elevation: 2,
  },
  stopIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
  },
  stopContent: {
    flex: 1,
  },
  stopHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 4,
  },
  stopNumber: {
    fontSize: 12,
    fontWeight: 'bold',
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  stopTime: {
    fontSize: 12,
  },
  stopTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    marginBottom: 4,
  },
  stopDescription: {
    fontSize: 14,
    lineHeight: 20,
  },
});

