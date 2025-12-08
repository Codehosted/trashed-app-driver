import React from 'react';
import { View, StyleSheet, ViewStyle } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';

interface SpotlightBackgroundProps {
  children: React.ReactNode;
  className?: string;
}

/**
 * React Native version of SpotlightBackground
 * Creates a gradient background with blur effect similar to web version
 */
export const SpotlightBackground: React.FC<SpotlightBackgroundProps> = ({ 
  children,
  className 
}) => {
  return (
    <View style={styles.container}>
      {/* Gradient overlay - similar to web version */}
      <LinearGradient
        colors={['rgba(147, 51, 234, 0.1)', 'rgba(255, 255, 255, 0)']}
        start={{ x: 0, y: 0 }}
        end={{ x: 0, y: 1 }}
        style={StyleSheet.absoluteFill}
      />
      {/* Content */}
      <View style={styles.content}>
        {children}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    position: 'relative',
    backgroundColor: '#f8fafc', // Light slate background
  },
  content: {
    flex: 1,
    paddingTop: 96, // Similar to pt-24 md:pt-32
    paddingHorizontal: 16,
    paddingBottom: 16,
  },
});

