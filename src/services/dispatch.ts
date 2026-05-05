import { APP_CONFIG } from '@/constants';
import { buildAuthHeaders } from '@/services/auth';
import type { RouteAssignment, RouteStop, AppMessage } from '@/types/domain';

const API_BASE_URL = APP_CONFIG.apiBaseUrl;

export interface MobileDispatchResponse {
  user: {
    uuid: string;
    role: 'admin' | 'manager' | 'driver';
    vendorId: number | null;
    vendorUuid: string | null;
    vendorName: string | null;
    driverUuid: string | null;
    canDrive: boolean;
    canManageDispatch: boolean;
  };
  routes: RouteAssignment[];
  activeRoute: RouteAssignment | null;
  messages: AppMessage[];
  dispatchPortalUrl: string;
}

type LocationPayload = {
  routeUuid?: string;
  latitude: number;
  longitude: number;
  speedMps?: number | null;
  previousSpeedMps?: number | null;
  heading?: number | null;
  accuracyMeters?: number | null;
  crashDetected?: boolean;
  fallDetected?: boolean;
  recordedAt?: string;
};

function toApiDate(date = new Date()): string {
  return date.toISOString().slice(0, 10);
}

export async function fetchMobileDispatch(date = new Date()): Promise<MobileDispatchResponse> {
  const headers = await buildAuthHeaders();
  const response = await fetch(`${API_BASE_URL}/api/mobile/dispatch?date=${toApiDate(date)}`, {
    headers,
  });

  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new Error(body.error || 'Failed to load dispatch');
  }

  return response.json();
}

export async function sendDriverLocation(payload: LocationPayload) {
  const headers = await buildAuthHeaders();
  await fetch(`${API_BASE_URL}/api/mobile/dispatch/location`, {
    method: 'POST',
    headers,
    body: JSON.stringify(payload),
  });
}

export async function updateStopStatus(
  routeUuid: string,
  stopUuid: string,
  status: RouteStop['status'],
  notes?: string
) {
  const headers = await buildAuthHeaders();
  const response = await fetch(
    `${API_BASE_URL}/api/mobile/dispatch/routes/${routeUuid}/stops/${stopUuid}/status`,
    {
      method: 'PATCH',
      headers,
      body: JSON.stringify({ status, notes }),
    }
  );

  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new Error(body.error || 'Failed to update stop');
  }

  return response.json();
}

export async function uploadStopImage(
  routeUuid: string,
  stopUuid: string,
  imageUri: string,
  category: 'job_site_photo' | 'landfill_receipt' = 'job_site_photo'
): Promise<string[]> {
  const headers = await buildAuthHeaders(false);
  const formData = new FormData();
  const extension = imageUri.split('.').pop()?.split('?')[0] || 'jpg';

  formData.append('category', category);
  formData.append('file', {
    uri: imageUri,
    name: `${stopUuid}-${Date.now()}.${extension}`,
    type: `image/${extension === 'png' ? 'png' : 'jpeg'}`,
  } as unknown as Blob);

  const response = await fetch(
    `${API_BASE_URL}/api/mobile/dispatch/routes/${routeUuid}/stops/${stopUuid}/photos`,
    {
      method: 'POST',
      headers,
      body: formData,
    }
  );

  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new Error(body.error || 'Failed to upload image');
  }

  const body = await response.json();
  return Array.isArray(body.images)
    ? body.images.map((image: { path: string }) => image.path).filter(Boolean)
    : [];
}

export async function registerPushToken(pushToken: string) {
  const headers = await buildAuthHeaders();
  await fetch(`${API_BASE_URL}/api/mobile/dispatch/push`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ pushToken }),
  });
}
