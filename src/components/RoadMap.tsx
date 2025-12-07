import React, { useMemo, useEffect } from 'react';
import { View, StyleSheet, Dimensions, Image } from 'react-native';
import Animated, { useAnimatedStyle, withSpring, useSharedValue } from 'react-native-reanimated';
import { Svg, Path } from 'react-native-svg';
import { RouteStop } from '@/types/domain';
import { MAP_CONFIG } from '@/constants';
import { RoadMarker } from './RoadMarker';
import { DriverMarker } from './DriverMarker';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');
const TILE_SIZE = 256;

interface RoadMapProps {
  stops: RouteStop[];
  activeIndex: number;
  onStopClick: (index: number) => void;
  theme: 'dark' | 'light';
  zoom: number;
  userLocation: { lat: number; lng: number } | null;
}

// Web Mercator Math
const latLngToGlobalPoint = (lat: number, lng: number, zoom: number) => {
  const scale = (1 << zoom) * TILE_SIZE;
  const x = ((lng + 180) / 360) * scale;
  const sinLat = Math.sin(lat * Math.PI / 180);
  const y = (0.5 - Math.log((1 + sinLat) / (1 - sinLat)) / (4 * Math.PI)) * scale;
  return { x, y };
};

const MapTiles: React.FC<{
  localCenter: { x: number; y: number };
  globalOrigin: { x: number; y: number };
  zoom: number;
  theme: 'dark' | 'light';
}> = ({ localCenter, globalOrigin, zoom, theme }) => {
  const globalCenterX = globalOrigin.x + localCenter.x;
  const globalCenterY = globalOrigin.y + localCenter.y;

  const centerTileX = Math.floor(globalCenterX / TILE_SIZE);
  const centerTileY = Math.floor(globalCenterY / TILE_SIZE);

  const rangeX = 10;
  const rangeY = 20;

  const tiles = [];
  for (let x = centerTileX - rangeX; x <= centerTileX + rangeX; x++) {
    for (let y = centerTileY - rangeY; y <= centerTileY + rangeY; y++) {
      tiles.push({ x, y });
    }
  }

  const tileBase = theme === 'dark'
    ? 'https://a.basemaps.cartocdn.com/dark_all'
    : 'https://a.basemaps.cartocdn.com/light_all';

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      {tiles.map((tile) => {
        const left = tile.x * TILE_SIZE - globalOrigin.x;
        const top = tile.y * TILE_SIZE - globalOrigin.y;

        return (
          <Image
            key={`${tile.x}-${tile.y}`}
            source={{ uri: `${tileBase}/${zoom}/${tile.x}/${tile.y}.png` }}
            style={{
              position: 'absolute',
              width: TILE_SIZE + 1,
              height: TILE_SIZE + 1,
              left,
              top,
              opacity: theme === 'dark' ? 1 : 0.9,
            }}
          />
        );
      })}
    </View>
  );
};

export const RoadMap: React.FC<RoadMapProps> = ({
  stops,
  activeIndex,
  onStopClick,
  theme,
  zoom,
  userLocation,
}) => {
  const globalPoints = useMemo(
    () =>
      stops.map((s) => ({
        ...latLngToGlobalPoint(s.coordinates.lat, s.coordinates.lng, zoom),
        id: s.uuid,
      })),
    [stops, zoom]
  );

  const origin = useMemo(() => globalPoints[0] || { x: 0, y: 0 }, [globalPoints]);

  const localPoints = useMemo(
    () =>
      globalPoints.map((p) => ({
        x: p.x - origin.x,
        y: p.y - origin.y,
        id: p.id,
      })),
    [globalPoints, origin]
  );

  const activeLocalPoint = localPoints[activeIndex] || { x: 0, y: 0 };

  const driverLocalPoint = useMemo(() => {
    if (!userLocation) return null;
    const global = latLngToGlobalPoint(userLocation.lat, userLocation.lng, zoom);
    return {
      x: global.x - origin.x,
      y: global.y - origin.y,
    };
  }, [userLocation, origin, zoom]);

  const pathData = useMemo(() => {
    if (localPoints.length === 0) return '';
    let d = `M ${localPoints[0].x} ${localPoints[0].y}`;
    for (let i = 1; i < localPoints.length; i++) {
      const p = localPoints[i];
      d += ` L ${p.x} ${p.y}`;
    }
    return d;
  }, [localPoints]);

  const bgColor = theme === 'dark' ? '#0a0a0a' : '#f0f4f8';
  const fogColor = theme === 'dark' ? 'rgba(10,10,10,1)' : 'rgba(240,244,248,1)';
  const fogTransparent = theme === 'dark' ? 'rgba(10,10,10,0)' : 'rgba(240,244,248,0)';

  // Shared values for smooth spring animations (like framer-motion)
  const translateX = useSharedValue(-activeLocalPoint.x);
  const translateY = useSharedValue(-activeLocalPoint.y);

  // Update shared values with spring animation when activeIndex changes
  useEffect(() => {
    translateX.value = withSpring(-activeLocalPoint.x, {
      damping: 20,
      stiffness: 90,
      mass: 1,
    });
    translateY.value = withSpring(-activeLocalPoint.y, {
      damping: 20,
      stiffness: 90,
      mass: 1,
    });
  }, [activeLocalPoint.x, activeLocalPoint.y, translateX, translateY]);

  // Animated style for map plane with spring animation
  const mapPlaneStyle = useAnimatedStyle(() => {
    return {
      transform: [
        { translateX: translateX.value },
        { translateY: translateY.value },
        { rotateX: `${MAP_CONFIG.tilt}deg` },
      ],
    };
  }, []);

  return (
    <View style={[styles.container, { backgroundColor: bgColor }]}>
      <Animated.View
        style={[
          styles.mapPlane,
          {
            width: SCREEN_WIDTH * 5,
            height: SCREEN_HEIGHT * 5,
            left: SCREEN_WIDTH * 2,
            top: SCREEN_HEIGHT * 2,
          },
          mapPlaneStyle,
        ]}
      >
        {/* Tile Layer */}
        <View style={[StyleSheet.absoluteFill, { overflow: 'visible' }]}>
          <MapTiles
            localCenter={activeLocalPoint}
            globalOrigin={origin}
            zoom={zoom}
            theme={theme}
          />
        </View>

        {/* Road Layer */}
        <View style={[StyleSheet.absoluteFill, { zIndex: 1 }]} pointerEvents="none">
          <Svg
            width={SCREEN_WIDTH * 5}
            height={SCREEN_HEIGHT * 5}
            style={{ position: 'absolute', top: 0, left: 0 }}
          >
            {/* Glow under the road */}
            <Path
              d={pathData}
              fill="none"
              stroke={theme === 'dark' ? '#4f46e5' : '#3b82f6'}
              strokeWidth={20}
              strokeLinecap="round"
              strokeLinejoin="round"
              opacity={theme === 'dark' ? 0.2 : 0.1}
            />
            {/* Main Road Surface */}
            <Path
              d={pathData}
              fill="none"
              stroke={theme === 'dark' ? '#1e293b' : '#94a3b8'}
              strokeWidth={12}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            {/* Center Line */}
            <Path
              d={pathData}
              fill="none"
              stroke={theme === 'dark' ? '#6366f1' : '#ffffff'}
              strokeWidth={2}
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeDasharray={theme === 'light' ? '8 8' : '0 0'}
            />
          </Svg>
        </View>

        {/* 3D Markers Layer */}
        <View style={{ zIndex: 50, position: 'relative' }}>
          {localPoints.map((p, i) => (
            <RoadMarker
              key={stops[i].uuid}
              stop={stops[i]}
              index={i}
              isActive={i === activeIndex}
              onPress={() => onStopClick(i)}
              x={p.x}
              y={p.y}
            />
          ))}

          {/* Driver Marker */}
          {driverLocalPoint && (
            <DriverMarker x={driverLocalPoint.x} y={driverLocalPoint.y} />
          )}
        </View>
      </Animated.View>

      {/* Horizon Fog */}
      <View
        style={[
          styles.fogTop,
          {
            backgroundColor: fogColor,
          },
        ]}
        pointerEvents="none"
      />
      <View
        style={[
          styles.fogBottom,
          {
            backgroundColor: fogColor,
          },
        ]}
        pointerEvents="none"
      />
      <View
        style={[
          styles.fogLeft,
          {
            backgroundColor: fogColor,
          },
        ]}
        pointerEvents="none"
      />
      <View
        style={[
          styles.fogRight,
          {
            backgroundColor: fogColor,
          },
        ]}
        pointerEvents="none"
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    width: '100%',
    height: '100%',
    overflow: 'hidden',
  },
  mapPlane: {
    position: 'absolute',
  },
  fogTop: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 120,
    zIndex: 10,
  },
  fogBottom: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: 100,
    zIndex: 10,
  },
  fogLeft: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: 0,
    width: 80,
    zIndex: 10,
  },
  fogRight: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    right: 0,
    width: 80,
    zIndex: 10,
  },
});

