import React, { useEffect } from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import Animated, { FadeIn, FadeOut, SlideInDown, SlideOutUp } from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';

interface NotificationToastProps {
  notification: { title: string; body: string } | null;
  onClose: () => void;
}

export const NotificationToast: React.FC<NotificationToastProps> = ({
  notification,
  onClose,
}) => {
  // Auto-dismiss after 5 seconds
  useEffect(() => {
    if (notification) {
      const timer = setTimeout(onClose, 5000);
      return () => clearTimeout(timer);
    }
  }, [notification, onClose]);

  if (!notification) return null;

  return (
    <Animated.View
      entering={SlideInDown}
      exiting={SlideOutUp}
      style={styles.container}
      pointerEvents="box-none"
    >
      <Pressable
        style={styles.toast}
        onPress={onClose}
      >
        <View
          style={[
            styles.iconContainer,
            {
              backgroundColor: '#4f46e5',
            },
          ]}
        >
          <Ionicons name="notifications" size={20} color="#ffffff" />
        </View>
        <View style={styles.content}>
          <Text style={styles.title}>{notification.title}</Text>
          <Text style={styles.body}>{notification.body}</Text>
        </View>
        <Pressable
          onPress={(e) => {
            e.stopPropagation();
            onClose();
          }}
          style={styles.closeButton}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          <Ionicons name="close" size={16} color="rgba(148, 163, 184, 1)" />
        </Pressable>
      </Pressable>
    </Animated.View>
  );
};

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    top: 24,
    left: 0,
    right: 0,
    alignItems: 'center',
    zIndex: 100,
    paddingHorizontal: 16,
  },
  toast: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 16,
    width: '100%',
    maxWidth: 448,
    padding: 16,
    borderRadius: 16,
    backgroundColor: 'rgba(15, 23, 42, 0.9)',
    borderWidth: 1,
    borderColor: 'rgba(51, 65, 85, 0.7)',
    shadowOffset: { width: 0, height: 8 },
    shadowRadius: 16,
    shadowOpacity: 0.3,
    elevation: 10,
  },
  iconContainer: {
    width: 40,
    height: 40,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  content: {
    flex: 1,
  },
  title: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#ffffff',
    marginBottom: 4,
  },
  body: {
    fontSize: 12,
    lineHeight: 18,
    color: 'rgba(203, 213, 225, 1)',
  },
  closeButton: {
    padding: 4,
  },
});

