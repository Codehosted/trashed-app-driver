import React, { useState } from 'react';
import { View, Text, StyleSheet, Pressable, ScrollView, Dimensions } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, { useSharedValue, useAnimatedStyle, withSpring, withTiming } from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';
import { RouteStop } from '@/types/domain';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');
const COLLAPSED_HEIGHT = 60;
const EXPANDED_HEIGHT = SCREEN_HEIGHT * 0.7;

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
  const [isExpanded, setIsExpanded] = useState(false);
  const insets = useSafeAreaInsets();
  // Start collapsed: visible at bottom with COLLAPSED_HEIGHT
  const translateY = useSharedValue(0);
  const height = useSharedValue(COLLAPSED_HEIGHT);

  const toggleExpanded = () => {
    const newExpanded = !isExpanded;
    setIsExpanded(newExpanded);
    
    if (newExpanded) {
      // Expand: slide up and increase height
      const slideUp = -(EXPANDED_HEIGHT - COLLAPSED_HEIGHT);
      translateY.value = withSpring(slideUp, { damping: 20, stiffness: 90 });
      height.value = withSpring(EXPANDED_HEIGHT, { damping: 20, stiffness: 90 });
    } else {
      // Collapse: slide down and decrease height
      translateY.value = withSpring(0, { damping: 20, stiffness: 90 });
      height.value = withSpring(COLLAPSED_HEIGHT, { damping: 20, stiffness: 90 });
    }
  };

  const animatedStyle = useAnimatedStyle(() => {
    return {
      transform: [{ translateY: translateY.value }],
      height: height.value,
    };
  });

  const handleSelect = (index: number) => {
    onSelect(index);
    if (isExpanded) {
      toggleExpanded();
    }
  };

  return (
    <Animated.View
      style={[
        styles.bottomSheet,
        {
          backgroundColor: isDark ? 'rgba(15, 23, 42, 0.98)' : 'rgba(255, 255, 255, 0.98)',
          borderTopColor: isDark ? 'rgba(51, 65, 85, 0.8)' : 'rgba(203, 213, 225, 1)',
        },
        animatedStyle,
      ]}
      pointerEvents={isExpanded ? 'auto' : 'box-none'}
    >
      <SafeAreaView edges={['bottom']} style={styles.safeArea}>
        {/* Handle Bar */}
        <Pressable
          onPress={toggleExpanded}
          style={[
            styles.handleBar,
            {
              backgroundColor: isDark ? 'rgba(15, 23, 42, 0.5)' : 'rgba(248, 250, 252, 0.5)',
            },
          ]}
          pointerEvents="auto"
        >
          <View style={styles.handleIndicator} />
          <Text
            style={[
              styles.headerTitle,
              {
                color: isDark ? '#ffffff' : '#0f172a',
              },
            ]}
          >
            Today's Route ({stops.length})
          </Text>
          <View style={styles.rightButtons}>
            <Pressable
              onPress={toggleExpanded}
              style={styles.chevronButton}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            >
              <Ionicons
                name={isExpanded ? 'chevron-down' : 'chevron-up'}
                size={20}
                color={isDark ? 'rgba(148, 163, 184, 1)' : 'rgba(100, 116, 139, 1)'}
              />
            </Pressable>
            <Pressable
              onPress={onClose}
              style={styles.closeButton}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            >
              <Ionicons
                name="close"
                size={18}
                color={isDark ? 'rgba(148, 163, 184, 1)' : 'rgba(100, 116, 139, 1)'}
              />
            </Pressable>
          </View>
        </Pressable>

        {/* Content Area */}
        {isExpanded && (
          <ScrollView
            style={styles.scrollView}
            contentContainerStyle={styles.scrollContent}
            showsVerticalScrollIndicator={true}
            indicatorStyle={isDark ? 'white' : 'black'}
          >
            {stops.length === 0 ? (
              <View style={styles.emptyState}>
                <Text
                  style={[
                    styles.emptyStateText,
                    {
                      color: isDark ? 'rgba(148, 163, 184, 1)' : 'rgba(100, 116, 139, 1)',
                    },
                  ]}
                >
                  No stops available
                </Text>
              </View>
            ) : (
              stops.map((stop, i) => {
              const isActive = i === activeIndex;
              const color = stop.color || '#64748b';

              return (
                  <Pressable
                  key={stop.uuid}
                  onPress={() => handleSelect(i)}
                  style={[
                    styles.stopCard,
                    {
                      backgroundColor: isActive
                        ? isDark
                          ? 'rgba(99, 102, 241, 0.2)'
                          : 'rgba(238, 242, 255, 0.5)'
                        : isDark
                        ? 'rgba(15, 23, 42, 0.5)'
                        : 'rgba(248, 250, 252, 1)',
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
              })
            )}
          </ScrollView>
        )}
      </SafeAreaView>
    </Animated.View>
  );
};

const styles = StyleSheet.create({
  bottomSheet: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    borderTopWidth: 1,
    shadowOffset: { width: 0, height: -10 },
    shadowRadius: 20,
    shadowOpacity: 0.3,
    elevation: 10,
    overflow: 'hidden',
    zIndex: 25,
  },
  safeArea: {
    flex: 1,
    minHeight: 0,
  },
  handleBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(203, 213, 225, 0.3)',
  },
  handleIndicator: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: 'rgba(148, 163, 184, 0.5)',
    position: 'absolute',
    top: 8,
    left: '50%',
    marginLeft: -20,
  },
  headerTitle: {
    fontSize: 16,
    fontWeight: '600',
    flex: 1,
    textAlign: 'center',
    marginLeft: 20,
  },
  rightButtons: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  chevronButton: {
    padding: 8,
    borderRadius: 20,
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
  emptyState: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 60,
  },
  emptyStateText: {
    fontSize: 16,
    textAlign: 'center',
  },
});

