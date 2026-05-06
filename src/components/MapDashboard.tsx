import React, { useState, useMemo, useEffect, useCallback, useRef } from 'react';
import { View, Text, StyleSheet, Pressable, ImageBackground } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { GestureHandlerRootView, GestureDetector, Gesture } from 'react-native-gesture-handler';
import { runOnJS } from 'react-native-reanimated';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RootStackParamList } from '@/types/navigation';
import { useAuth } from '@/context/AuthContext';
import { useDriverLocation } from '@/context/DriverLocationContext';
import { usePreferences } from '@/context/PreferencesContext';
import { designSchema } from '@/data/designSchema';
import { RouteStop, RouteAssignment, AppMessage } from '@/types/domain';
import { MAP_CONFIG } from '@/constants';
import { Ionicons } from '@expo/vector-icons';
import * as dispatchService from '@/services/dispatch';
import { registerForPushNotificationsAsync } from '@/services/notifications';
import { useDispatchLive, type LiveDispatchEvent } from '@/hooks/useDispatchLive';

// Components
import { RoadMap } from './RoadMap';
import { InfoCard } from './InfoCard';
import { WeatherWidget } from './WeatherWidget';
import { ListView } from './ListView';
import { NotificationToast } from './NotificationToast';
import { BrandLogo } from './BrandLogo';

const serviceHeroImage = require('../../assets/visuals/dumpster-service-hero.jpg');
const LIVE_EVENT_TYPES = new Set(['route_assigned', 'route_updated', 'route_status', 'route_reordered']);

interface MapDashboardProps {
  route?: RouteAssignment | { params?: { route?: RouteAssignment } };
}

function getProvidedRoute(routeProp?: MapDashboardProps['route']): RouteAssignment | undefined {
  if (!routeProp) return undefined;
  if ('stops' in routeProp) return routeProp;
  return routeProp.params?.route;
}

function formatEventTitle(eventType: string): string {
  switch (eventType) {
    case 'route_assigned':
      return 'New Route Assigned';
    case 'route_updated':
      return 'Route Updated';
    case 'route_status':
      return 'Route Status Updated';
    case 'route_reordered':
      return 'Route Order Updated';
    default:
      return 'Dispatch Update';
  }
}

function mapLiveEventToMessage(event: LiveDispatchEvent): AppMessage | null {
  if (!LIVE_EVENT_TYPES.has(event.eventType)) return null;

  return {
    id: event.eventId,
    type: event.eventType === 'route_status' ? 'warning' : 'info',
    title: formatEventTitle(event.eventType),
    content: event.message || 'Dispatch updated your route.',
    time: event.recordedAt,
  };
}

function formatRouteStatus(status?: string): string {
  if (!status) return 'Live route';
  return status.replace(/[_-]/g, ' ');
}

function formatTaskLabel(stop: RouteStop): string {
  if (stop.taskType) return stop.taskType.replace(/[_-]/g, ' ');
  return 'Stop';
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
  const { currentLocation, setActiveRouteUuid } = useDriverLocation();

  // SpacetimeDB realtime subscription
  const { locations: liveLocations, events: liveEvents, connected: liveConnected } = useDispatchLive(vendorId);
  const suppliedRoute = getProvidedRoute(propRoute);
  const route = useMemo(() => {
    if (suppliedRoute?.stops && suppliedRoute.stops.length > 0) {
      return suppliedRoute;
    }
    if (dispatchRoute?.stops && dispatchRoute.stops.length > 0) {
      return dispatchRoute;
    }
    return null;
  }, [dispatchRoute, suppliedRoute]);

  // Initialize stops from route
  const [stops, setStops] = useState<RouteStop[]>(() => {
    return route?.stops ?? [];
  });

  // Update stops when propRoute or dispatchRoute changes
  useEffect(() => {
    if (route?.stops && route.stops.length > 0) {
      setStops(route.stops);
    }
  }, [route]);

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
  const [zoom, setZoom] = useState<number>(MAP_CONFIG.defaultZoom);
  const userLocation = currentLocation
    ? { lat: currentLocation.lat, lng: currentLocation.lng }
    : null;
  const [activeNotification, setActiveNotification] = useState<{
    title: string;
    body: string;
  } | null>(null);
  const liveStartedAtRef = useRef(Date.now());
  const seenLiveEventIdsRef = useRef(new Set<string>());

  useEffect(() => {
    if (suppliedRoute || (isAuthEnabled && !user)) return;

    let cancelled = false;
    dispatchService
      .fetchMobileDispatch()
      .then((data) => {
        if (cancelled) return;
        if (data.activeRoute) {
          setDispatchRoute(data.activeRoute);
        }
        if (data.user.vendorId) {
          setVendorId(data.user.vendorId);
        }
      })
      .catch((error) => {
        console.warn('Failed to load dispatch route', error);
      });

    return () => {
      cancelled = true;
    };
  }, [suppliedRoute, isAuthEnabled, user]);

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
    liveStartedAtRef.current = Date.now();
    seenLiveEventIdsRef.current.clear();
  }, [vendorId]);

  useEffect(() => {
    if (!vendorId || liveEvents.length === 0) return;

    const nextMessages: AppMessage[] = [];
    for (const event of liveEvents) {
      if (seenLiveEventIdsRef.current.has(event.eventId)) continue;
      seenLiveEventIdsRef.current.add(event.eventId);

      const recordedAt = Date.parse(event.recordedAt);
      if (Number.isFinite(recordedAt) && recordedAt < liveStartedAtRef.current - 1000) {
        continue;
      }

      const message = mapLiveEventToMessage(event);
      if (message) {
        nextMessages.push(message);
      }
    }

    if (nextMessages.length === 0) return;

    setActiveNotification({
      title: nextMessages[0].title,
      body: nextMessages[0].content,
    });

    if (!suppliedRoute) {
      dispatchService
        .fetchMobileDispatch()
        .then((data) => {
          if (data.activeRoute) {
            setDispatchRoute(data.activeRoute);
          }
        })
        .catch((error) => {
          console.warn('Failed to refresh dispatch route after live event', error);
        });
    }
  }, [liveEvents, suppliedRoute, vendorId]);

  useEffect(() => {
    setActiveRouteUuid(route?.uuid ?? null);
    return () => {
      setActiveRouteUuid(null);
    };
  }, [route?.uuid, setActiveRouteUuid]);

  // Calculate travel metrics
  const travelStats = useMemo(() => {
    if (activeIndex === 0 && !userLocation) return { distance: undefined, driveTime: undefined };

    const target = stops[activeIndex];
    const origin = userLocation || (activeIndex > 0 ? stops[activeIndex - 1].coordinates : null);

    if (!origin || !target.coordinates) return { distance: undefined, driveTime: undefined };

    const km = getDistance(origin.lat, origin.lng, target.coordinates.lat, target.coordinates.lng);
    if (km > 160) return { distance: undefined, driveTime: undefined };
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
    return dispatchService.uploadStopImage(route.uuid, stop.uuid || stop.id, imageUri, category);
  };

  // Safety check - ensure we have stops
  if (!stops || stops.length === 0) {
    return (
      <SafeAreaView style={[styles.emptyDashboard, { backgroundColor: palette.background }]} edges={['top', 'bottom']}>
        <View style={styles.emptyHeader}>
          <BrandLogo
            textColor={palette.text}
            accentColor={palette.accent}
            mutedColor={palette.subtleText}
            subtitle="DRIVER PORTAL"
          />
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Open profile settings"
            style={[styles.emptyIconButton, { borderColor: theme === 'dark' ? '#262a33' : '#dbe3ee' }]}
            onPress={() => navigation.navigate('Profile')}
          >
            <Ionicons name="person" size={18} color={palette.subtleText} />
          </Pressable>
        </View>
        <ImageBackground
          source={serviceHeroImage}
          resizeMode="cover"
          style={styles.emptyImage}
          imageStyle={styles.emptyImageRadius}
        >
          <View style={styles.emptyImageScrim} />
        </ImageBackground>
        <View style={styles.emptyCopy}>
          <Ionicons name="checkmark-circle-outline" size={44} color={palette.success} />
          <Text style={[styles.emptyTitle, { color: palette.text }]}>No active route</Text>
          <Text style={[styles.emptyText, { color: palette.subtleText }]}>
            Your dashboard will update when dispatch assigns a route.
          </Text>
        </View>
      </SafeAreaView>
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

  const completedStops = stops.filter((stop) => stop.status === 'completed').length;
  const routeProgress = `${completedStops}/${stops.length}`;
  const liveDriverCount = Object.keys(liveLocations).length;
  const activeTaskLabel = formatTaskLabel(activeStop);
  const routeStatusLabel = formatRouteStatus(route?.status);
  const liveDriverLabel = liveDriverCount > 0
    ? `${liveDriverCount} driver${liveDriverCount === 1 ? '' : 's'} live`
    : liveConnected ? 'Live sync' : 'Offline sync';
  const activeStopTitle = activeStop.name || activeStop.title || 'Current stop';

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: palette.background }]} edges={['top', 'bottom']}>
      <GestureHandlerRootView style={styles.container}>
        {/* Notifications Overlay */}
        <NotificationToast
          notification={activeNotification}
          onClose={() => setActiveNotification(null)}
        />

        <ImageBackground
          source={serviceHeroImage}
          resizeMode="cover"
          style={styles.dashboardHero}
          imageStyle={styles.dashboardHeroImage}
        >
          <View style={styles.dashboardHeroScrim} />
          <View style={styles.dashboardHeader}>
            <BrandLogo
              textColor="#ffffff"
              accentColor="#60a5fa"
              mutedColor="#a6adbb"
              subtitle={route?.label ? route.label.toUpperCase() : 'DRIVER PORTAL'}
              size="sm"
            />
            <View style={styles.dashboardHeaderActions}>
              <View style={styles.dashboardLivePill}>
                <View style={[styles.dashboardLiveDot, { backgroundColor: liveConnected ? '#22c55e' : '#64748b' }]} />
                <Text style={styles.dashboardLiveText}>{liveConnected ? 'LIVE' : 'SYNC'}</Text>
              </View>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Open route list"
                style={styles.dashboardIconButton}
                onPress={() => setIsListViewOpen(true)}
              >
                <Ionicons name="list" size={17} color="#ffffff" />
              </Pressable>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Open profile settings"
                style={styles.dashboardIconButton}
                onPress={() => navigation.navigate('Profile')}
              >
                <Ionicons name="person" size={17} color="#ffffff" />
              </Pressable>
            </View>
          </View>

          <View style={styles.dashboardRouteRow}>
            <View style={styles.dashboardRouteCopy}>
              <Text style={styles.dashboardEyebrow}>{routeStatusLabel}</Text>
              <Text style={styles.dashboardTitle} numberOfLines={2}>
                {activeStopTitle}
              </Text>
              <Text style={styles.dashboardMeta} numberOfLines={1}>
                {activeTaskLabel} / stop {activeIndex + 1} of {stops.length}
              </Text>
            </View>
            <View style={styles.dashboardProgress}>
              <Text style={styles.dashboardProgressValue}>{routeProgress}</Text>
              <Text style={styles.dashboardProgressLabel}>done</Text>
            </View>
          </View>

          <View style={styles.dashboardFooterRow}>
            <View style={styles.dashboardMiniStat}>
              <Ionicons name="location" size={14} color="#60a5fa" />
              <Text style={styles.dashboardMiniText}>{liveDriverLabel}</Text>
            </View>
            <WeatherWidget theme="dark" />
          </View>
        </ImageBackground>

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

      {/* Right Side Controls Stack */}
      <View style={styles.rightControls}>
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
  emptyDashboard: {
    flex: 1,
    paddingHorizontal: 18,
  },
  emptyHeader: {
    paddingTop: 10,
    paddingBottom: 16,
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
  },
  emptyIconButton: {
    width: 38,
    height: 38,
    borderRadius: 19,
    borderWidth: 1,
    backgroundColor: '#ffffff',
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyImage: {
    height: 238,
    borderRadius: 28,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#dbe3ee',
  },
  emptyImageRadius: {
    borderRadius: 28,
  },
  emptyImageScrim: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(7, 11, 47, 0.12)',
  },
  emptyCopy: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    paddingHorizontal: 18,
  },
  emptyTitle: {
    fontSize: 22,
    fontWeight: '900',
  },
  emptyText: {
    fontSize: 14,
    lineHeight: 20,
    textAlign: 'center',
  },
  dashboardHero: {
    position: 'absolute',
    top: 10,
    left: 14,
    right: 14,
    height: 188,
    borderRadius: 28,
    overflow: 'hidden',
    zIndex: 35,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.42)',
    shadowColor: '#070b2f',
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.16,
    shadowRadius: 22,
    elevation: 10,
  },
  dashboardHeroImage: {
    borderRadius: 28,
  },
  dashboardHeroScrim: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(7, 11, 47, 0.48)',
  },
  dashboardHeader: {
    paddingHorizontal: 18,
    paddingTop: 16,
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 12,
  },
  dashboardHeaderActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  dashboardLivePill: {
    minHeight: 34,
    borderRadius: 17,
    paddingHorizontal: 12,
    backgroundColor: 'rgba(255, 255, 255, 0.14)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.18)',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
  },
  dashboardLiveDot: {
    width: 7,
    height: 7,
    borderRadius: 3.5,
  },
  dashboardLiveText: {
    color: '#ffffff',
    fontSize: 11,
    fontWeight: '900',
    letterSpacing: 0.8,
  },
  dashboardIconButton: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: 'rgba(255, 255, 255, 0.14)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.18)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  dashboardRouteRow: {
    paddingHorizontal: 18,
    paddingTop: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 14,
  },
  dashboardRouteCopy: {
    flex: 1,
    minWidth: 0,
  },
  dashboardEyebrow: {
    color: '#dbeafe',
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 1.6,
    textTransform: 'uppercase',
  },
  dashboardTitle: {
    marginTop: 5,
    color: '#ffffff',
    fontSize: 22,
    lineHeight: 25,
    fontWeight: '900',
    letterSpacing: 0,
  },
  dashboardMeta: {
    marginTop: 4,
    color: '#dbeafe',
    fontSize: 13,
    fontWeight: '800',
  },
  dashboardProgress: {
    width: 66,
    height: 66,
    borderRadius: 22,
    backgroundColor: '#ffffff',
    alignItems: 'center',
    justifyContent: 'center',
  },
  dashboardProgressValue: {
    color: '#070b2f',
    fontSize: 21,
    fontWeight: '900',
  },
  dashboardProgressLabel: {
    color: '#526071',
    fontSize: 10,
    fontWeight: '900',
    textTransform: 'uppercase',
  },
  dashboardFooterRow: {
    paddingHorizontal: 18,
    paddingTop: 10,
    paddingBottom: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  dashboardMiniStat: {
    minHeight: 34,
    borderRadius: 17,
    paddingHorizontal: 12,
    backgroundColor: 'rgba(255, 255, 255, 0.12)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.16)',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
  },
  dashboardMiniText: {
    color: '#ffffff',
    fontSize: 12,
    fontWeight: '800',
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
    letterSpacing: 0,
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
    top: 188,
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
    top: 214,
    right: 12,
    zIndex: 30,
    alignItems: 'flex-end',
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
});
