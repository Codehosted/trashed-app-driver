import React from 'react';
import { View, StyleSheet } from 'react-native';
import Animated, {
  useAnimatedStyle,
  withRepeat,
  withTiming,
  Easing,
} from 'react-native-reanimated';

interface DriverMarkerProps {
  x: number;
  y: number;
}

export const DriverMarker: React.FC<DriverMarkerProps> = ({ x, y }) => {
  const pulseStyle = useAnimatedStyle(() => {
    return {
      transform: [
        {
          scale: withRepeat(
            withTiming(2, {
              duration: 1500,
              easing: Easing.out(Easing.ease),
            }),
            -1,
            false
          ),
        },
      ],
      opacity: withRepeat(
        withTiming(0, {
          duration: 1500,
          easing: Easing.out(Easing.ease),
        }),
        -1,
        false
      ),
    };
  });

  return (
    <View
      style={[
        styles.container,
        {
          left: x,
          top: y,
          zIndex: Math.floor(y) + 10,
        },
      ]}
      pointerEvents="none"
    >
      {/* Pulse Effect */}
      <Animated.View
        style={[
          styles.pulse,
          {
            width: 60,
            height: 60,
            borderWidth: 2,
            borderColor: '#6366f1',
          },
          pulseStyle,
        ]}
      />

      {/* 3D Vehicle Representation */}
      <View style={styles.vehicle}>
        {/* Shadow */}
        <View style={styles.shadow} />

        {/* Body Main */}
        <View style={[styles.body, { backgroundColor: '#4f46e5' }]} />

        {/* Cabin */}
        <View style={[styles.cabin, { backgroundColor: '#818cf8' }]} />

        {/* Windshield */}
        <View style={[styles.windshield, { backgroundColor: '#bfdbfe' }]} />
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
  },
  pulse: {
    position: 'absolute',
    top: '50%',
    left: '50%',
    marginLeft: -30,
    marginTop: -30,
    borderRadius: 30,
  },
  vehicle: {
    position: 'absolute',
    top: '50%',
    left: '50%',
    marginLeft: -12,
    marginTop: -20,
  },
  shadow: {
    position: 'absolute',
    top: 0,
    left: -5,
    width: 20,
    height: 32,
    backgroundColor: 'rgba(0,0,0,0.4)',
    borderRadius: 16,
  },
  body: {
    position: 'absolute',
    top: 0,
    left: -12,
    width: 24,
    height: 40,
    borderRadius: 4,
  },
  cabin: {
    position: 'absolute',
    top: 0,
    left: -10,
    width: 20,
    height: 24,
    borderRadius: 2,
  },
  windshield: {
    position: 'absolute',
    top: -5,
    left: -9,
    width: 18,
    height: 8,
  },
});

