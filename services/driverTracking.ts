import { getDefaultDriverRouteUuid, getTrashedWebBaseUrl } from './appConfig';

export interface DriverPositionBeacon {
  routeUuid?: string | null;
  lat: number;
  lng: number;
  accuracy?: number | null;
  heading?: number | null;
  speed?: number | null;
  batteryLevel?: number | null;
  source?: 'web' | 'android' | 'ios';
  recordedAt?: string;
}

export interface DriverPositionBeaconResult {
  ok: boolean;
  status: number;
  beaconId?: string;
  error?: string;
}

const DRIVER_TRACKING_API_PATH = '/api/vendor/driver/tracking';

export async function sendDriverPositionBeacon(
  beacon: DriverPositionBeacon,
  fetchImpl: typeof fetch = fetch
): Promise<DriverPositionBeaconResult> {
  const routeUuid = beacon.routeUuid || getDefaultDriverRouteUuid();
  const payload = {
    routeUuid,
    lat: beacon.lat,
    lng: beacon.lng,
    accuracy: beacon.accuracy ?? null,
    heading: beacon.heading ?? null,
    speed: beacon.speed ?? null,
    batteryLevel: beacon.batteryLevel ?? null,
    source: beacon.source || inferRuntimeSource(),
    recordedAt: beacon.recordedAt || new Date().toISOString(),
  };

  try {
    const response = await fetchImpl(`${getTrashedWebBaseUrl()}${DRIVER_TRACKING_API_PATH}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'ngrok-skip-browser-warning': 'true',
      },
      credentials: 'include',
      body: JSON.stringify(payload),
    });

    let body: { id?: string; error?: string } | null = null;
    try {
      body = await response.json();
    } catch {
      body = null;
    }

    return {
      ok: response.ok,
      status: response.status,
      beaconId: body?.id,
      error: body?.error || (response.ok ? undefined : response.statusText),
    };
  } catch (error) {
    return {
      ok: false,
      status: 0,
      error: error instanceof Error ? error.message : 'Unable to send driver position beacon',
    };
  }
}

function inferRuntimeSource(): 'web' | 'android' | 'ios' {
  if (typeof navigator === 'undefined') return 'web';
  const ua = navigator.userAgent.toLowerCase();
  if (ua.includes('android')) return 'android';
  if (ua.includes('iphone') || ua.includes('ipad')) return 'ios';
  return 'web';
}
