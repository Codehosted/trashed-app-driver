import React, { useState, useMemo, useEffect } from 'react';
import { View, Text, StyleSheet, Pressable, Dimensions, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { useAuth } from '@/context/AuthContext';
import { usePreferences } from '@/context/PreferencesContext';
import { designSchema } from '@/data/designSchema';
import { RouteStop, RouteAssignment, AppMessage } from '@/types/domain';
import { INITIAL_STOPS, INITIAL_MESSAGES, MAP_CONFIG } from '@/constants';
import * as Location from 'expo-location';
import { Ionicons } from '@expo/vector-icons';

// Components
import { RoadMap } from './RoadMap';
import { InfoCard } from './InfoCard';
import { WeatherWidget } from './WeatherWidget';
import { MessageCarousel } from './MessageCarousel';
import { ListView } from './ListView';
import { NotificationToast } from './NotificationToast';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

interface MapDashboardProps {
  route?: RouteAssignment;
}

// Haversine distance calculation
function getDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371; // km
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c; // Distance in km
}

export const MapDashboard: React.FC<MapDashboardProps> = ({ route: propRoute }) => {
  const { user, isAuthEnabled } = useAuth();
  const { theme } = usePreferences();
  const palette = designSchema.theme[theme];

  // Get the route
  const getRoute = () => {
    if (propRoute?.stops && propRoute.stops.length > 0) {
      return propRoute;
    }
    const sampleRoute = designSchema?.sampleRoute;
    if (sampleRoute?.stops && sampleRoute.stops.length > 0) {
      return sampleRoute;
    }
    return {
      uuid: 'fallback-route',
      label: 'Default Route',
      status: 'in_progress' as const,
      stops: INITIAL_STOPS,
    };
  };

  const route = getRoute();

  // Initialize stops from route
  const [stops, setStops] = useState<RouteStop[]>(() => {
    const routeStops = route?.stops;
    if (Array.isArray(routeStops) && routeStops.length > 0) {
      return routeStops;
    }
    return INITIAL_STOPS;
  });

  // Update stops when propRoute changes
  useEffect(() => {
    const newRoute = getRoute();
    if (newRoute?.stops && newRoute.stops.length > 0) {
      setStops(newRoute.stops);
    }
  }, [propRoute]);

  const [activeIndex, setActiveIndex] = useState(0);
  const [isListViewOpen, setIsListViewOpen] = useState(false);
  const [zoom, setZoom] = useState(MAP_CONFIG.defaultZoom);
  const [userLocation, setUserLocation] = useState<{ lat: number; lng: number } | null>(null);
  const [messages] = useState<AppMessage[]>(INITIAL_MESSAGES);
  const [activeNotification, setActiveNotification] = useState<{
    title: string;
    body: string;
  } | null>(null);

  // Request location permissions and track location
  useEffect(() => {
    let subscription: Location.LocationSubscription | null = null;

    (async () => {
      try {
        if (Platform.OS !== 'web') {
          const { status } = await Location.requestForegroundPermissionsAsync();
          if (status !== 'granted') {
            console.warn('Location permission denied');
            return;
          }

          subscription = await Location.watchPositionAsync(
            {
              accuracy: Location.Accuracy.High,
              timeInterval: 10000,
              distanceInterval: 10,
            },
            (location) => {
              setUserLocation({
                lat: location.coords.latitude,
                lng: location.coords.longitude,
              });
            }
          );
        } else {
          // Web fallback
          if ('geolocation' in navigator) {
            navigator.geolocation.watchPosition(
              (position) => {
                setUserLocation({
                  lat: position.coords.latitude,
                  lng: position.coords.longitude,
                });
              },
              (error) => {
                console.warn('Location permission denied or unavailable', error);
              },
              { enableHighAccuracy: true, maximumAge: 10000, timeout: 5000 }
            );
          }
        }
      } catch (error) {
        console.warn('Location permission denied or unavailable', error);
      }
    })();

    return () => {
      if (subscription) {
        subscription.remove();
      }
    };
  }, []);

  // Calculate travel metrics
  const travelStats = useMemo(() => {
    if (activeIndex === 0 && !userLocation) return { distance: undefined, driveTime: undefined };

    const target = stops[activeIndex];
    const origin = userLocation || (activeIndex > 0 ? stops[activeIndex - 1].coordinates : null);

    if (!origin || !target.coordinates) return { distance: undefined, driveTime: undefined };

    const km = getDistance(origin.lat, origin.lng, target.coordinates.lat, target.coordinates.lng);
    const speed = km > 10 ? 50 : 25; // km/h
    const mins = Math.round((km / speed) * 60);
    const hours = Math.floor(mins / 60);
    const remainingMins = mins % 60;

    let timeString = `${mins} min`;
    if (hours > 0) {
      timeString = `${hours}h ${remainingMins}m`;
    }

    return {
      distance: km < 1 ? `${Math.round(km * 1000)} m` : `${km.toFixed(1)} km`,
      driveTime: timeString,
    };
  }, [activeIndex, stops, userLocation]);

  const handleNext = () => {
    if (activeIndex < stops.length - 1) {
      setActiveIndex((prev) => prev + 1);
    }
  };

  const handlePrev = () => {
    if (activeIndex > 0) {
      setActiveIndex((prev) => prev - 1);
    }
  };

  const handleUpdateStop = (id: string, updates: Partial<RouteStop>) => {
    setStops((prev) => prev.map((stop) => (stop.uuid === id ? { ...stop, ...updates } : stop)));
  };

  const triggerTestNotification = () => {
    setActiveNotification({
      title: 'New Assignment Received',
      body: 'A new priority stop has been added to your route.',
    });
  };

  // Safety check - ensure we have stops
  if (!stops || stops.length === 0) {
    return (
      <View
        style={[
          styles.container,
          { backgroundColor: palette.background, justifyContent: 'center', alignItems: 'center' },
        ]}
      >
        <Text style={{ color: palette.text }}>No route data available</Text>
      </View>
    );
  }

  const activeStop = stops[activeIndex];
  if (!activeStop) {
    return (
      <View
        style={[
          styles.container,
          { backgroundColor: palette.background, justifyContent: 'center', alignItems: 'center' },
        ]}
      >
        <Text style={{ color: palette.text }}>Loading...</Text>
      </View>
    );
  }

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: palette.background }]} edges={['top', 'bottom']}>
      <GestureHandlerRootView style={styles.container}>
        {/* Notifications Overlay */}
        <NotificationToast
          notification={activeNotification}
          onClose={() => setActiveNotification(null)}
        />

        {/* Top Overlay Gradient */}
        <View
          style={[
            styles.topGradient,
            {
              backgroundColor: theme === 'dark' ? 'rgba(15, 23, 42, 0.8)' : 'rgba(248, 250, 252, 0.8)',
            },
          ]}
          pointerEvents="none"
        />

        {/* Branding */}
        <View style={styles.branding} pointerEvents="none">
          <Text style={[styles.brandTitle, { color: palette.text }]}>
            trash<Text style={{ color: palette.accent }}>ed</Text>
          </Text>
          <Text style={[styles.brandSubtitle, { color: palette.subtleText }]}>DRIVER PORTAL</Text>
        </View>

        {/* Weather Widget - Top Right */}
        <View style={styles.weatherWidget} pointerEvents="none">
          <WeatherWidget theme={theme} />
        </View>

      {/* Main 3D Map View Area */}
      <View style={styles.mapContainer}>
        <RoadMap
          stops={stops}
          activeIndex={activeIndex}
          onStopClick={setActiveIndex}
          theme={theme}
          zoom={zoom}
          userLocation={userLocation}
        />
      </View>

        {/* Navigation Hints (Side Chevrons) */}
        {activeIndex > 0 && (
          <Pressable
            style={[styles.navHint, styles.navHintLeft]}
            onPress={handlePrev}
          >
            <View
              style={[
                styles.navHintCircle,
                {
                  backgroundColor: theme === 'dark' ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.1)',
                },
              ]}
            >
              <Ionicons
                name="chevron-back"
                size={24}
                color={theme === 'dark' ? '#ffffff' : '#0f172a'}
              />
            </View>
          </Pressable>
        )}
        {activeIndex < stops.length - 1 && (
          <Pressable
            style={[styles.navHint, styles.navHintRight]}
            onPress={handleNext}
          >
            <View
              style={[
                styles.navHintCircle,
                {
                  backgroundColor: theme === 'dark' ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.1)',
                },
              ]}
            >
              <Ionicons
                name="chevron-forward"
                size={24}
                color={theme === 'dark' ? '#ffffff' : '#0f172a'}
              />
            </View>
          </Pressable>
        )}

      {/* Center Info Card */}
      <InfoCard
        stop={activeStop}
        index={activeIndex}
        theme={theme}
        distance={travelStats.distance}
        driveTime={travelStats.driveTime}
        onUpdateStop={handleUpdateStop}
      />

      {/* Message Carousel - Bottom Center */}
      <MessageCarousel messages={messages} theme={theme} />

      {/* Right Side Controls Stack */}
      <View style={styles.rightControls}>
        {/* Profile & List Group */}
        <View style={styles.controlGroup}>
          <Pressable
            style={[
              styles.controlButton,
              {
                backgroundColor: theme === 'dark' ? 'rgba(15, 23, 42, 0.8)' : 'rgba(255, 255, 255, 0.8)',
                borderColor: theme === 'dark' ? 'rgba(51, 65, 85, 0.7)' : 'rgba(203, 213, 225, 1)',
              },
            ]}
            onPress={() => {
              // Navigate to profile - would need navigation prop
              console.log('Profile pressed');
            }}
          >
            {user?.photoURL ? (
              <Text style={styles.profileText}>P</Text>
            ) : (
              <Ionicons
                name="person"
                size={16}
                color={theme === 'dark' ? '#ffffff' : '#475569'}
              />
            )}
          </Pressable>

          <Pressable
            style={[
              styles.controlButton,
              {
                backgroundColor: theme === 'dark' ? 'rgba(15, 23, 42, 0.8)' : 'rgba(255, 255, 255, 0.8)',
                borderColor: theme === 'dark' ? 'rgba(51, 65, 85, 0.7)' : 'rgba(203, 213, 225, 1)',
              },
            ]}
            onPress={() => setIsListViewOpen(true)}
          >
            <Ionicons name="list" size={16} color={theme === 'dark' ? '#ffffff' : '#475569'} />
          </Pressable>
        </View>

        {/* Zoom Controls */}
        <View
          style={[
            styles.zoomControls,
            {
              backgroundColor: theme === 'dark' ? 'rgba(15, 23, 42, 0.8)' : 'rgba(255, 255, 255, 0.8)',
              borderColor: theme === 'dark' ? 'rgba(51, 65, 85, 0.7)' : 'rgba(203, 213, 225, 1)',
            },
          ]}
        >
          <Pressable
            style={[
              styles.zoomButton,
              {
                borderBottomColor: theme === 'dark' ? 'rgba(51, 65, 85, 0.7)' : 'rgba(203, 213, 225, 1)',
              },
            ]}
            onPress={() => setZoom((z) => Math.min(z + 1, 18))}
          >
            <Ionicons
              name="add"
              size={14}
              color={theme === 'dark' ? '#ffffff' : '#475569'}
            />
          </Pressable>
          <Pressable
            style={styles.zoomButton}
            onPress={() => setZoom((z) => Math.max(z - 1, 10))}
          >
            <Ionicons
              name="remove"
              size={14}
              color={theme === 'dark' ? '#ffffff' : '#475569'}
            />
          </Pressable>
        </View>

        {/* Alerts Icon */}
        <Pressable
          style={[
            styles.controlButton,
            styles.alertButton,
            {
              backgroundColor: theme === 'dark' ? 'rgba(15, 23, 42, 0.8)' : 'rgba(255, 255, 255, 0.8)',
              borderColor: theme === 'dark' ? 'rgba(51, 65, 85, 0.7)' : 'rgba(203, 213, 225, 1)',
            },
          ]}
          onPress={triggerTestNotification}
        >
          <Ionicons name="notifications" size={16} color={theme === 'dark' ? '#ffffff' : '#475569'} />
          <View style={styles.alertDot} />
        </Pressable>
      </View>

        {/* List View Overlay */}
        {isListViewOpen && (
          <ListView
            stops={stops}
            activeIndex={activeIndex}
            onSelect={(i) => {
              setActiveIndex(i);
              setIsListViewOpen(false);
            }}
            onClose={() => setIsListViewOpen(false)}
            theme={theme}
          />
        )}
      </GestureHandlerRootView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    position: 'relative',
  },
  topGradient: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 128,
    zIndex: 10,
  },
  branding: {
    position: 'absolute',
    top: 8,
    left: 12,
    zIndex: 20,
  },
  brandTitle: {
    fontSize: 24,
    fontWeight: '900',
    letterSpacing: -1,
    lineHeight: 28,
  },
  brandSubtitle: {
    fontSize: 9,
    fontWeight: 'bold',
    letterSpacing: 2,
    textTransform: 'uppercase',
    marginLeft: 4,
  },
  weatherWidget: {
    position: 'absolute',
    top: 8,
    right: 80,
    zIndex: 20,
  },
  mapContainer: {
    flex: 1,
    width: '100%',
    height: '100%',
  },
  navHint: {
    position: 'absolute',
    top: '50%',
    zIndex: 20,
    marginTop: -20,
  },
  navHintLeft: {
    left: 8,
  },
  navHintRight: {
    right: 8,
  },
  navHintCircle: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 10,
  },
  rightControls: {
    position: 'absolute',
    top: 8,
    right: 12,
    zIndex: 30,
    alignItems: 'flex-end',
    gap: 8,
  },
  controlGroup: {
    flexDirection: 'column',
    gap: 8,
  },
  controlButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: 1,
    justifyContent: 'center',
    alignItems: 'center',
    shadowOffset: { width: 0, height: 2 },
    shadowRadius: 8,
    shadowOpacity: 0.1,
    elevation: 3,
  },
  profileText: {
    fontSize: 12,
    fontWeight: 'bold',
    color: '#ffffff',
  },
  zoomControls: {
    borderRadius: 18,
    borderWidth: 1,
    overflow: 'hidden',
    shadowOffset: { width: 0, height: 2 },
    shadowRadius: 8,
    shadowOpacity: 0.1,
    elevation: 3,
  },
  zoomButton: {
    width: 36,
    height: 36,
    justifyContent: 'center',
    alignItems: 'center',
    borderBottomWidth: 1,
  },
  alertButton: {
    position: 'relative',
    marginTop: 8,
  },
  alertDot: {
    position: 'absolute',
    top: 6,
    right: 6,
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#ef4444',
    borderWidth: 1,
    borderColor: '#0f172a',
  },
});
