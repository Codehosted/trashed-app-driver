import React from 'react';
import { View, StyleSheet, Image, Pressable } from 'react-native';
import Animated, { useAnimatedStyle, withSpring } from 'react-native-reanimated';
import { RouteStop } from '@/types/domain';

interface RoadMarkerProps {
  stop: RouteStop;
  isActive: boolean;
  onPress: () => void;
  x: number;
  y: number;
  index: number;
}

export const RoadMarker: React.FC<RoadMarkerProps> = ({
  stop,
  isActive,
  onPress,
  x,
  y,
  index,
}) => {
  const width = 32;
  const depth = 32;
  const height = isActive ? 80 : 40;
  const avatarUrl = `https://api.dicebear.com/9.x/avataaars/svg?seed=${stop.uuid}`;
  const labelAltitude = height + 30;

  const markerStyle = useAnimatedStyle(() => {
    return {
      transform: [
        { translateY: isActive ? withSpring(-10) : withSpring(0) },
      ],
    };
  });

  const color = stop.color || '#64748b';

  return (
    <Pressable
      style={[
        styles.container,
        {
          left: x,
          top: y,
          zIndex: Math.floor(y),
        },
      ]}
      onPress={onPress}
    >
      {/* Shadow */}
      <View
        style={[
          styles.shadow,
          {
            width: width * 1.5,
            height: depth * 1.5,
            backgroundColor: isActive ? color : 'rgba(0,0,0,0.5)',
            opacity: 0.5,
          },
        ]}
      />

      {/* Pillar Container */}
      <Animated.View style={[styles.pillarContainer, markerStyle]}>
        {/* Front Face */}
        <View
          style={[
            styles.face,
            styles.frontFace,
            {
              width,
              height,
              backgroundColor: color,
            },
          ]}
        />

        {/* Back Face */}
        <View
          style={[
            styles.face,
            styles.backFace,
            {
              width,
              height,
              backgroundColor: color,
              opacity: 0.7,
            },
          ]}
        />

        {/* Right Face */}
        <View
          style={[
            styles.face,
            styles.rightFace,
            {
              width: depth,
              height,
              backgroundColor: color,
              opacity: 0.85,
            },
          ]}
        />

        {/* Left Face */}
        <View
          style={[
            styles.face,
            styles.leftFace,
            {
              width: depth,
              height,
              backgroundColor: color,
              opacity: 0.85,
            },
          ]}
        />

        {/* Top Cap (Roof) */}
        <View
          style={[
            styles.topCap,
            {
              width,
              height: depth,
            },
          ]}
        >
          <Image
            source={{ uri: avatarUrl }}
            style={StyleSheet.absoluteFill}
            resizeMode="cover"
          />
        </View>

        {/* Bottom Cap (Floor) */}
        <View
          style={[
            styles.bottomCap,
            {
              width,
              height: depth,
              backgroundColor: color,
              opacity: 0.4,
            },
          ]}
        />
      </Animated.View>

      {/* 3D Label - Floating above the pillar */}
      {isActive && (
        <View
          style={[
            styles.labelContainer,
            {
              top: -labelAltitude,
            },
          ]}
        >
          <View style={styles.label}>
            <View style={styles.labelShadow} />
            <View style={styles.labelShadow} />
            <View style={styles.labelShadow} />
            <View style={styles.labelShadow} />
            <View style={styles.labelFace}>
              {/* Label text would go here - simplified for now */}
            </View>
          </View>
        </View>
      )}
    </Pressable>
  );
};

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
  },
  shadow: {
    position: 'absolute',
    top: '50%',
    left: '50%',
    marginLeft: -32,
    marginTop: -32,
    borderRadius: 32,
  },
  pillarContainer: {
    position: 'absolute',
    top: '50%',
    left: '50%',
    marginLeft: -16,
    marginTop: -20,
  },
  face: {
    position: 'absolute',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.3)',
  },
  frontFace: {
    top: 0,
    left: 0,
  },
  backFace: {
    top: 0,
    left: 0,
  },
  rightFace: {
    top: 0,
    left: 0,
  },
  leftFace: {
    top: 0,
    left: 0,
  },
  topCap: {
    position: 'absolute',
    top: 0,
    left: 0,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.4)',
    overflow: 'hidden',
  },
  bottomCap: {
    position: 'absolute',
    top: 0,
    left: 0,
  },
  labelContainer: {
    position: 'absolute',
    left: '50%',
    marginLeft: -40,
  },
  label: {
    position: 'relative',
  },
  labelShadow: {
    position: 'absolute',
    width: 80,
    height: 30,
    backgroundColor: '#1e293b',
    borderRadius: 8,
  },
  labelFace: {
    width: 80,
    height: 30,
    backgroundColor: '#0f172a',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(100,116,139,0.5)',
  },
});

