import React, { useState } from 'react';
import { View, Text, StyleSheet, Pressable, Dimensions, PanResponder } from 'react-native';
import Animated, { FadeIn, FadeOut, useAnimatedStyle, withSpring } from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';
import { AppMessage } from '@/types/domain';

interface MessageCarouselProps {
  messages: AppMessage[];
  theme: 'dark' | 'light';
}

const { width: SCREEN_WIDTH } = Dimensions.get('window');

export const MessageCarousel: React.FC<MessageCarouselProps> = ({
  messages: initialMessages,
  theme,
}) => {
  const [messages, setMessages] = useState(initialMessages);
  const [currentIndex, setCurrentIndex] = useState(0);
  const isDark = theme === 'dark';

  if (messages.length === 0) return null;

  const currentMessage = messages[currentIndex];

  const handleDismiss = () => {
    const newMessages = messages.filter((_, i) => i !== currentIndex);
    setMessages(newMessages);
    if (currentIndex >= newMessages.length) {
      setCurrentIndex(Math.max(0, newMessages.length - 1));
    }
  };

  const handleNext = () => {
    setCurrentIndex((prev) => (prev + 1) % messages.length);
  };

  const panResponder = PanResponder.create({
    onStartShouldSetPanResponder: () => true,
    onMoveShouldSetPanResponder: () => true,
    onPanResponderRelease: (evt, gestureState) => {
      const swipe = Math.abs(gestureState.dx) * gestureState.vx;
      if (swipe < -100 || swipe > 100) {
        handleNext();
      }
    },
  });

  const getIcon = (type: string) => {
    switch (type) {
      case 'urgent':
        return <Ionicons name="warning" size={16} color="#ef4444" />;
      case 'warning':
        return <Ionicons name="notifications" size={16} color="#f59e0b" />;
      default:
        return <Ionicons name="information-circle" size={16} color="#3b82f6" />;
    }
  };

  const getBorderColor = (type: string) => {
    switch (type) {
      case 'urgent':
        return '#ef4444';
      case 'warning':
        return '#f59e0b';
      default:
        return '#3b82f6';
    }
  };

  return (
    <View style={styles.container} pointerEvents="box-none">
      <Animated.View
        key={currentMessage.id}
        entering={FadeIn}
        exiting={FadeOut}
        style={[
          styles.messageCard,
          {
            backgroundColor: isDark ? 'rgba(15, 23, 42, 0.9)' : 'rgba(255, 255, 255, 0.9)',
            borderLeftColor: getBorderColor(currentMessage.type),
            borderColor: isDark ? 'rgba(51, 65, 85, 0.7)' : 'rgba(203, 213, 225, 1)',
          },
        ]}
        {...panResponder.panHandlers}
      >
        <View style={styles.messageContentContainer}>
          <View
            style={[
              styles.iconContainer,
              {
                backgroundColor: isDark ? 'rgba(15, 23, 42, 0.5)' : '#f1f5f9',
              },
            ]}
          >
            {getIcon(currentMessage.type)}
          </View>
          <View style={styles.textContainer}>
            <View style={styles.messageHeader}>
              <Text
                style={[
                  styles.messageTitle,
                  {
                    color: isDark ? '#ffffff' : '#0f172a',
                  },
                ]}
                numberOfLines={1}
              >
                {currentMessage.title}
              </Text>
              <Text
                style={[
                  styles.messageTime,
                  {
                    color: isDark ? 'rgba(255, 255, 255, 0.6)' : 'rgba(15, 23, 42, 0.6)',
                  },
                ]}
              >
                {currentMessage.time}
              </Text>
            </View>
            <Text
              style={[
                styles.messageBody,
                {
                  color: isDark ? 'rgba(255, 255, 255, 0.8)' : 'rgba(15, 23, 42, 0.8)',
                },
              ]}
              numberOfLines={2}
            >
              {currentMessage.content}
            </Text>
          </View>
          <Pressable
            onPress={handleDismiss}
            style={styles.dismissButton}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          >
            <Ionicons
              name="close"
              size={14}
              color={isDark ? 'rgba(255, 255, 255, 0.6)' : 'rgba(15, 23, 42, 0.6)'}
            />
          </Pressable>
        </View>

        {/* Pagination Dots */}
        {messages.length > 1 && (
          <View style={styles.dotsContainer}>
            {messages.map((_, i) => (
              <View
                key={i}
                style={[
                  styles.dot,
                  {
                    backgroundColor:
                      i === currentIndex
                        ? isDark
                          ? '#ffffff'
                          : '#0f172a'
                        : isDark
                        ? 'rgba(51, 65, 85, 0.7)'
                        : 'rgba(203, 213, 225, 1)',
                  },
                ]}
              />
            ))}
          </View>
        )}
      </Animated.View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    bottom: 16,
    left: 0,
    right: 0,
    alignItems: 'center',
    zIndex: 30,
  },
  messageCard: {
    width: SCREEN_WIDTH - 32,
    maxWidth: 384,
    padding: 12,
    borderRadius: 12,
    borderLeftWidth: 4,
    borderWidth: 1,
    shadowOffset: { width: 0, height: 4 },
    shadowRadius: 12,
    shadowOpacity: 0.2,
    elevation: 8,
  },
  messageContentContainer: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    marginBottom: 8,
  },
  iconContainer: {
    width: 32,
    height: 32,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
  },
  textContainer: {
    flex: 1,
    minWidth: 0,
  },
  messageHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  messageTitle: {
    fontSize: 12,
    fontWeight: 'bold',
    flex: 1,
  },
  messageTime: {
    fontSize: 9,
    fontWeight: '500',
    marginLeft: 8,
  },
  messageBody: {
    fontSize: 11,
    lineHeight: 16,
  },
  dismissButton: {
    padding: 4,
  },
  dotsContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 4,
    marginTop: 8,
  },
  dot: {
    width: 4,
    height: 4,
    borderRadius: 2,
  },
});

