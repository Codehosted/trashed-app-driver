import { Capacitor, registerPlugin } from '@capacitor/core';
import { sendDriverPositionBeacon } from './driverTracking';

interface BackgroundGeolocationLocation {
  latitude: number;
  longitude: number;
  accuracy?: number | null;
  bearing?: number | null;
  speed?: number | null;
  time?: number | null;
}

interface BackgroundGeolocationError {
  code?: string;
  message?: string;
}

interface BackgroundGeolocationPlugin {
  addWatcher(
    options: {
      backgroundMessage?: string;
      backgroundTitle?: string;
      requestPermissions?: boolean;
      stale?: boolean;
      distanceFilter?: number;
    },
    callback: (
      location?: BackgroundGeolocationLocation,
      error?: BackgroundGeolocationError
    ) => void
  ): Promise<string>;
  removeWatcher(options: { id: string }): Promise<void>;
  openSettings(): Promise<void>;
}

const BackgroundGeolocation = registerPlugin<BackgroundGeolocationPlugin>('BackgroundGeolocation');

const BEACON_INTERVAL_MS = 10_000;
const PENDING_BEACON_STORAGE_KEY = 'trashed.driver.pending-location-beacons';

export interface DriverLocationUpdate {
  lat: number;
  lng: number;
  accuracy?: number | null;
  heading?: number | null;
  speed?: number | null;
  recordedAt?: string;
}

export interface BackgroundDriverTrackingOptions {
  routeUuid: string | null;
  onLocation?: (location: DriverLocationUpdate) => void;
  onError?: (error: Error) => void;
}

export interface BackgroundDriverTrackingController {
  mode: 'native' | 'web';
  stop: () => Promise<void>;
}

type PendingBeacon = DriverLocationUpdate & {
  routeUuid: string | null;
  source: 'web' | 'android' | 'ios';
};

export async function startBackgroundDriverTracking(
  options: BackgroundDriverTrackingOptions
): Promise<BackgroundDriverTrackingController> {
  if (!options.routeUuid) {
    throw new Error('Cannot start driver location tracking without a route UUID.');
  }

  await flushPendingDriverPositionBeacons(options.onError);

  if (Capacitor.isNativePlatform()) {
    return startNativeBackgroundDriverTracking(options);
  }

  return startWebFallbackDriverTracking(options);
}

export async function stopBackgroundDriverTracking(
  controller: BackgroundDriverTrackingController | null | undefined
): Promise<void> {
  await controller?.stop();
}

async function startNativeBackgroundDriverTracking(
  options: BackgroundDriverTrackingOptions
): Promise<BackgroundDriverTrackingController> {
  let lastBeaconAt = 0;
  const source = getNativeSource();

  const watcherId = await BackgroundGeolocation.addWatcher(
    {
      backgroundTitle: 'Trashed Driver route tracking',
      backgroundMessage: 'Sharing your location while your route is active.',
      requestPermissions: true,
      stale: false,
      distanceFilter: 25,
    },
    (location, pluginError) => {
      if (pluginError) {
        options.onError?.(toError(pluginError));
        return;
      }
      if (!location) return;

      const update = normalizeNativeLocation(location);
      options.onLocation?.(update);
      void maybeSendBeacon(options.routeUuid, update, source, lastBeaconAt).then((sentAt) => {
        lastBeaconAt = sentAt;
      }).catch((error) => {
        options.onError?.(toError(error));
      });
    }
  );

  return {
    mode: 'native',
    stop: () => BackgroundGeolocation.removeWatcher({ id: watcherId }),
  };
}

function startWebFallbackDriverTracking(
  options: BackgroundDriverTrackingOptions
): BackgroundDriverTrackingController {
  if (typeof navigator === 'undefined' || !("geolocation" in navigator)) {
    throw new Error('Geolocation is not available in this runtime.');
  }

  let lastBeaconAt = 0;
  const watchId = navigator.geolocation.watchPosition(
    (position) => {
      const update: DriverLocationUpdate = {
        lat: position.coords.latitude,
        lng: position.coords.longitude,
        accuracy: position.coords.accuracy,
        heading: position.coords.heading,
        speed: position.coords.speed,
        recordedAt: new Date(position.timestamp || Date.now()).toISOString(),
      };
      options.onLocation?.(update);
      void maybeSendBeacon(options.routeUuid, update, 'web', lastBeaconAt).then((sentAt) => {
        lastBeaconAt = sentAt;
      }).catch((error) => {
        options.onError?.(toError(error));
      });
    },
    (error) => options.onError?.(toError(error)),
    { enableHighAccuracy: true, maximumAge: 10000, timeout: 5000 }
  );

  return {
    mode: 'web',
    stop: async () => navigator.geolocation.clearWatch(watchId),
  };
}

async function maybeSendBeacon(
  routeUuid: string | null,
  update: DriverLocationUpdate,
  source: PendingBeacon['source'],
  lastBeaconAt: number
): Promise<number> {
  const now = Date.now();
  if (now - lastBeaconAt < BEACON_INTERVAL_MS) {
    return lastBeaconAt;
  }

  const pendingBeacon: PendingBeacon = { ...update, routeUuid, source };
  const result = await sendDriverPositionBeacon({
    routeUuid,
    lat: update.lat,
    lng: update.lng,
    accuracy: update.accuracy,
    heading: update.heading,
    speed: update.speed,
    source,
    recordedAt: update.recordedAt,
  });

  if (!result.ok) {
    queuePendingBeacon(pendingBeacon);
    throw new Error(result.error || `Driver position beacon failed with HTTP ${result.status}`);
  }

  await flushPendingDriverPositionBeacons();
  return now;
}

async function flushPendingDriverPositionBeacons(onError?: (error: Error) => void): Promise<void> {
  const pending = readPendingBeacons();
  if (pending.length === 0) return;

  const stillPending: PendingBeacon[] = [];
  for (const beacon of pending) {
    const result = await sendDriverPositionBeacon(beacon);
    if (!result.ok) {
      stillPending.push(beacon);
      onError?.(new Error(result.error || `Pending driver position beacon failed with HTTP ${result.status}`));
    }
  }

  writePendingBeacons(stillPending);
}

function normalizeNativeLocation(location: BackgroundGeolocationLocation): DriverLocationUpdate {
  return {
    lat: location.latitude,
    lng: location.longitude,
    accuracy: location.accuracy ?? null,
    heading: location.bearing ?? null,
    speed: location.speed ?? null,
    recordedAt: new Date(location.time || Date.now()).toISOString(),
  };
}

function getNativeSource(): 'android' | 'ios' {
  return Capacitor.getPlatform() === 'ios' ? 'ios' : 'android';
}

function readPendingBeacons(): PendingBeacon[] {
  if (typeof localStorage === 'undefined') return [];
  try {
    const raw = localStorage.getItem(PENDING_BEACON_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.slice(-50) : [];
  } catch {
    return [];
  }
}

function writePendingBeacons(beacons: PendingBeacon[]): void {
  if (typeof localStorage === 'undefined') return;
  if (beacons.length === 0) {
    localStorage.removeItem(PENDING_BEACON_STORAGE_KEY);
    return;
  }
  localStorage.setItem(PENDING_BEACON_STORAGE_KEY, JSON.stringify(beacons.slice(-50)));
}

function queuePendingBeacon(beacon: PendingBeacon): void {
  writePendingBeacons([...readPendingBeacons(), beacon]);
}

function toError(error: unknown): Error {
  if (error instanceof Error) return error;
  if (typeof error === 'object' && error && 'message' in error) {
    return new Error(String((error as { message?: unknown }).message));
  }
  return new Error(String(error));
}
