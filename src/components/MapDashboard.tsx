import React, { useState, useMemo, useEffect, useCallback, useRef } from 'react';
import { View, Text, StyleSheet, Pressable, Dimensions, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { GestureHandlerRootView, GestureDetector, Gesture } from 'react-native-gesture-handler';
import { runOnJS } from 'react-native-reanimated';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RootStackParamList } from '@/types/navigation';
import { useAuth } from '@/context/AuthContext';
import { usePreferences } from '@/context/PreferencesContext';
import { designSchema } from '@/data/designSchema';
import { RouteStop, RouteAssignment, AppMessage } from '@/types/domain';
import { MAP_CONFIG } from '@/constants';
import * as Location from 'expo-location';
import { Ionicons } from '@expo/vector-icons';
import * as dispatchService from '@/services/dispatch';
import { registerForPushNotificationsAsync } from '@/services/notifications';
import { useDispatchLive } from '@/hooks/useDispatchLive';

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

type NavigationProp = NativeStackNavigationProp<RootStackParamList>;

export const MapDashboard: React.FC<MapDashboardProps> = ({ route: propRoute }) => {
  const { user, isAuthEnabled } = useAuth();
  const { theme } = usePreferences();
  const palette = designSchema.theme[theme];
  const navigation = useNavigation<NavigationProp>();
  const [dispatchRoute, setDispatchRoute] = useState<RouteAssignment | null>(null);
  const [vendorId, setVendorId] = useState<number | null>(null);
  const previousSpeedRef = useRef<number | null>(null);
  const locationRouteUuidRef = useRef<string | null>(null);

  // SpacetimeDB realtime subscription
  const { locations: liveLocations, events: liveEvents, connected: liveConnected } = useDispatchLive(vendorId);

  // Get the route — no mock fallbacks
  const getRoute = () => {
    if (propRoute?.stops && propRoute.stops.length > 0) {
      return propRoute;
    }
    if (dispatchRoute?.stops && dispatchRoute.stops.length > 0) {
      return dispatchRoute;
    }
    return null;
  };

  const route = getRoute();

  // Initialize stops from route
  const [stops, setStops] = useState<RouteStop[]>(() => {
    return route?.stops ?? [];
  });

  // Update stops when propRoute or dispatchRoute changes
  useEffect(() => {
    const newRoute = getRoute();
    if (newRoute?.stops && newRoute.stops.length > 0) {
      setStops(newRoute.stops);
    }
  }, [propRoute, dispatchRoute]);

  // Apply realtime dispatch events to stop statuses
  useEffect(() => {
    if (liveEvents.length === 0) return;
    setStops((prev) =>
      prev.map((stop) => {
        const event = liveEvents.find(
          (e) => e.stopUuid === stop.uuid && e.eventType === 'stop_status_change'
        );
        if (event && event.status && event.status !== stop.status) {
          return { ...stop, status: event.status as RouteStop['status'] };
        }
        return stop;
      })
    );
  }, [liveEvents]);

  const [activeIndex, setActiveIndex] = useState(0);
  const [isListViewOpen, setIsListViewOpen] = useState(false);
  const [zoom, setZoom] = useState(MAP_CONFIG.defaultZoom);
  const [userLocation, setUserLocation] = useState<{ lat: number; lng: number } | null>(null);
  const [messages, setMessages] = useState<AppMessage[]>([]);
  const [activeNotification, setActiveNotification] = useState<{
    title: string;
    body: string;
  } | null>(null);

  useEffect(() => {
    if (propRoute || (isAuthEnabled && !user)) return;

    let cancelled = false;
    dispatchService
      .fetchMobileDispatch()
      .then((data) => {
        if (cancelled) return;
        if (data.activeRoute) {
          setDispatchRoute(data.activeRoute);
          locationRouteUuidRef.current = data.activeRoute.uuid;
        }
        if (data.user.vendorId) {
          setVendorId(data.user.vendorId);
        }
        if (data.messages.length > 0) {
          setMessages(data.messages);
        }
      })
      .catch((error) => {
        console.warn('Failed to load dispatch route', error);
      });

    return () => {
      cancelled = true;
    };
  }, [propRoute, isAuthEnabled, user]);

  useEffect(() => {
    if (isAuthEnabled && !user) return;
    registerForPushNotificationsAsync()
      .then((registration) => {
        if (registration.pushToken) {
          return dispatchService.registerPushToken(registration.pushToken);
        }
      })
      .catch((error) => {
        console.warn('Failed to register push token', error);
      });
  }, [isAuthEnabled, user]);

  useEffect(() => {
    locationRouteUuidRef.current = route?.uuid ?? null;
  }, [route?.uuid]);

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
              timeInterval: 3000,
              distanceInterval: 5,
            },
            (location) => {
              const speedMps =
                typeof location.coords.speed === 'number' && Number.isFinite(location.coords.speed)
                  ? location.coords.speed
                  : null;
              setUserLocation({
                lat: location.coords.latitude,
                lng: location.coords.longitude,
              });
              void dispatchService.sendDriverLocation({
                routeUuid: locationRouteUuidRef.current ?? undefined,
                latitude: location.coords.latitude,
                longitude: location.coords.longitude,
                speedMps,
                previousSpeedMps: previousSpeedRef.current,
                heading:
                  typeof location.coords.heading === 'number' && Number.isFinite(location.coords.heading)
                    ? location.coords.heading
                    : null,
                accuracyMeters:
                  typeof location.coords.accuracy === 'number' && Number.isFinite(location.coords.accuracy)
                    ? location.coords.accuracy
                    : null,
                recordedAt: new Date(location.timestamp).toISOString(),
              });
              previousSpeedRef.current = speedMps;
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

  const handleNext = useCallback(() => {
    try {
      if (stops && stops.length > 0 && activeIndex < stops.length - 1) {
        setActiveIndex((prev) => Math.min(prev + 1, stops.length - 1));
      }
    } catch (error) {
      console.error('Error in handleNext:', error);
    }
  }, [activeIndex, stops]);

  const handlePrev = useCallback(() => {
    try {
      if (stops && stops.length > 0 && activeIndex > 0) {
        setActiveIndex((prev) => Math.max(prev - 1, 0));
      }
    } catch (error) {
      console.error('Error in handlePrev:', error);
    }
  }, [activeIndex, stops]);

  // Swipe gesture for map container - only horizontal swipes
  // Use runOnJS to safely call state updates from gesture handler
  const swipeGesture = useMemo(
    () =>
      Gesture.Pan()
        .minDistance(10)
        .activeOffsetX([-10, 10])
        .failOffsetY([-10, 10])
        .onEnd((event) => {
          'worklet';
          const threshold = 50;
          if (Math.abs(event.translationX) > threshold) {
            if (event.translationX < -threshold) {
              // Swipe left - next stop
              runOnJS(handleNext)();
            } else if (event.translationX > threshold) {
              // Swipe right - previous stop
              runOnJS(handlePrev)();
            }
          }
        }),
    [handleNext, handlePrev]
  );

  const handleUpdateStop = (id: string, updates: Partial<RouteStop>) => {
    setStops((prev) => prev.map((stop) => (stop.uuid === id ? { ...stop, ...updates } : stop)));
    if (!route) return;
    if (updates.status) {
      void dispatchService.updateStopStatus(route.uuid, id, updates.status, updates.notes).catch((error) => {
        console.warn('Failed to sync stop status', error);
      });
    }
    if (updates.notes !== undefined && !updates.status) {
      const currentStop = stops.find((stop) => stop.uuid === id);
      if (currentStop) {
        void dispatchService.updateStopStatus(route.uuid, id, currentStop.status, updates.notes).catch((error) => {
          console.warn('Failed to sync stop notes', error);
        });
      }
    }
  };

  const handleUploadPhoto = async (
    stop: RouteStop,
    category: 'job_site_photo' | 'landfill_receipt',
    imageUri: string
  ) => {
    if (!route) return [];
    return dispatchService.uploadStopImage(route.uuid, stop.uuid, imageUri, category);
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
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <Text style={[styles.brandTitle, { color: palette.text }]}>
              trash<Text style={{ color: palette.accent }}>ed</Text>
            </Text>
            <View
              style={{
                width: 6,
                height: 6,
                borderRadius: 3,
                backgroundColor: liveConnected ? '#10b981' : '#64748b',
                marginTop: 4,
              }}
            />
          </View>
          <Text style={[styles.brandSubtitle, { color: palette.subtleText }]}>DRIVER PORTAL</Text>
        </View>

        {/* Weather Widget - Top Right */}
        <View style={styles.weatherWidget} pointerEvents="none">
          <WeatherWidget theme={theme} />
        </View>

        {/* Main 3D Map View Area - Full Screen Background */}
        <View style={styles.mapContainer}>
          <GestureDetector gesture={swipeGesture}>
            <RoadMap
              stops={stops}
              activeIndex={activeIndex}
              onStopClick={setActiveIndex}
              theme={theme}
              zoom={zoom}
              userLocation={userLocation}
            />
          </GestureDetector>
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
          onUploadPhoto={handleUploadPhoto}
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
            onPress={() => navigation.navigate('Profile')}
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
            onPress={() => setZoom((z: number) => Math.min(z + 1, 18))}
          >
            <Ionicons
              name="add"
              size={14}
              color={theme === 'dark' ? '#ffffff' : '#475569'}
            />
          </Pressable>
          <Pressable
            style={styles.zoomButton}
            onPress={() => setZoom((z: number) => Math.max(z - 1, 10))}
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
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    width: '100%',
    height: '100%',
    overflow: 'hidden',
    zIndex: 1,
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
    top: 100,
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
