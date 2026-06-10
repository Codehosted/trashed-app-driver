export type VendorWebTarget =
  | 'dashboard'
  | 'dispatch'
  | 'rentals'
  | 'inventory'
  | 'customers'
  | 'settings';

const DEFAULT_WEB_BASE_URL = 'http://localhost:3000';

export function getTrashedWebBaseUrl(): string {
  const configured = import.meta.env.VITE_TRASHED_WEB_BASE_URL as string | undefined;
  return (configured || DEFAULT_WEB_BASE_URL).replace(/\/$/, '');
}

export function getDefaultDriverRouteUuid(): string | null {
  const routeFromEnv =
    (import.meta.env.VITE_DEFAULT_DRIVER_ROUTE_UUID as string | undefined) ||
    (import.meta.env.VITE_TRASHED_DRIVER_ROUTE_UUID as string | undefined);
  if (routeFromEnv) return routeFromEnv;

  if (typeof window === 'undefined') return null;
  const params = new URLSearchParams(window.location.search);
  return params.get('routeUuid') || params.get('route') || null;
}

export function buildVendorWebUrl(target: VendorWebTarget): string {
  const baseUrl = getTrashedWebBaseUrl();
  const targetPaths: Record<VendorWebTarget, string> = {
    dashboard: '/vendor/dashboard',
    dispatch: '/vendor/dispatch',
    rentals: '/vendor/rentals',
    inventory: '/vendor/inventory',
    customers: '/vendor/customers',
    settings: '/vendor/settings',
  };

  const url = new URL(targetPaths[target], baseUrl);
  url.searchParams.set('mobile', '1');
  url.searchParams.set('source', 'trashed-driver-app');
  return url.toString();
}

export function getDriverTrackingEndpoint(): string {
  return `${getTrashedWebBaseUrl()}/api/vendor/driver/tracking`;
}
