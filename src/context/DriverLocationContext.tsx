import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { Platform } from 'react-native';
import * as Location from 'expo-location';
import { useAuth } from '@/context/AuthContext';
import * as dispatchService from '@/services/dispatch';

export type DriverDeviceLocation = {
  lat: number;
  lng: number;
  speedMps?: number | null;
  heading?: number | null;
  accuracyMeters?: number | null;
  recordedAt: string;
};

type DriverLocationContextValue = {
  currentLocation: DriverDeviceLocation | null;
  permissionStatus: Location.PermissionStatus | 'unavailable' | null;
  setActiveRouteUuid: (routeUuid: string | null) => void;
};

const DriverLocationContext = createContext<DriverLocationContextValue | undefined>(undefined);

export function DriverLocationProvider({ children }: { children: React.ReactNode }) {
  const { user, isAuthEnabled } = useAuth();
  const [currentLocation, setCurrentLocation] = useState<DriverDeviceLocation | null>(null);
  const [permissionStatus, setPermissionStatus] = useState<Location.PermissionStatus | 'unavailable' | null>(null);
  const activeRouteUuidRef = useRef<string | null>(null);
  const previousSpeedRef = useRef<number | null>(null);
  const setActiveRouteUuid = useCallback((routeUuid: string | null) => {
    activeRouteUuidRef.current = routeUuid;
  }, []);

  useEffect(() => {
    if (isAuthEnabled && !user) {
      setCurrentLocation(null);
      activeRouteUuidRef.current = null;
      previousSpeedRef.current = null;
      return;
    }

    let subscription: Location.LocationSubscription | null = null;
    let cancelled = false;

    const publishLocation = (location: DriverDeviceLocation) => {
      setCurrentLocation(location);
      void dispatchService.sendDriverLocation({
        routeUuid: activeRouteUuidRef.current ?? undefined,
        latitude: location.lat,
        longitude: location.lng,
        speedMps: location.speedMps,
        previousSpeedMps: previousSpeedRef.current,
        heading: location.heading,
        accuracyMeters: location.accuracyMeters,
        recordedAt: location.recordedAt,
      }).catch((error) => {
        console.warn('Failed to broadcast driver location', error);
      });
      previousSpeedRef.current = location.speedMps ?? null;
    };

    const startNativeWatch = async () => {
      const { status } = await Location.requestForegroundPermissionsAsync();
      setPermissionStatus(status);
      if (status !== Location.PermissionStatus.GRANTED || cancelled) {
        return;
      }

      subscription = await Location.watchPositionAsync(
        {
          accuracy: Location.Accuracy.High,
          timeInterval: 3000,
          distanceInterval: 5,
        },
        (location) => {
          publishLocation({
            lat: location.coords.latitude,
            lng: location.coords.longitude,
            speedMps:
              typeof location.coords.speed === 'number' && Number.isFinite(location.coords.speed)
                ? location.coords.speed
                : null,
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
        }
      );
    };

    const startWebWatch = () => {
      if (!('geolocation' in navigator)) {
        setPermissionStatus('unavailable');
        return () => undefined;
      }

      const watchId = navigator.geolocation.watchPosition(
        (position) => {
          publishLocation({
            lat: position.coords.latitude,
            lng: position.coords.longitude,
            speedMps:
              typeof position.coords.speed === 'number' && Number.isFinite(position.coords.speed)
                ? position.coords.speed
                : null,
            heading:
              typeof position.coords.heading === 'number' && Number.isFinite(position.coords.heading)
                ? position.coords.heading
                : null,
            accuracyMeters:
              typeof position.coords.accuracy === 'number' && Number.isFinite(position.coords.accuracy)
                ? position.coords.accuracy
                : null,
            recordedAt: new Date().toISOString(),
          });
        },
        (error) => {
          console.warn('Location permission denied or unavailable', error);
          setPermissionStatus('unavailable');
        },
        { enableHighAccuracy: true, maximumAge: 10000, timeout: 5000 }
      );

      return () => navigator.geolocation.clearWatch(watchId);
    };

    let stopWebWatch: (() => void) | undefined;
    if (Platform.OS === 'web') {
      stopWebWatch = startWebWatch();
    } else {
      void startNativeWatch().catch((error) => {
        console.warn('Location permission denied or unavailable', error);
        setPermissionStatus('unavailable');
      });
    }

    return () => {
      cancelled = true;
      subscription?.remove();
      stopWebWatch?.();
    };
  }, [isAuthEnabled, user]);

  const value = useMemo<DriverLocationContextValue>(
    () => ({
      currentLocation,
      permissionStatus,
      setActiveRouteUuid,
    }),
    [currentLocation, permissionStatus, setActiveRouteUuid]
  );

  return (
    <DriverLocationContext.Provider value={value}>
      {children}
    </DriverLocationContext.Provider>
  );
}

export function useDriverLocation() {
  const context = useContext(DriverLocationContext);
  if (!context) {
    throw new Error('useDriverLocation must be used within DriverLocationProvider');
  }
  return context;
}
