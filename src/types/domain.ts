/**
 * Domain types — inlined from @trashed/shared-types
 */

// --- Theme ---

export type ThemeMode = 'light' | 'dark';
export type Theme = ThemeMode;

// --- Route types ---

export type RouteStatus = "scheduled" | "assigned" | "in_progress" | "complete" | "paused";

export type RouteStopType = "yard" | "pickup" | "dropoff" | "swap" | "service" | "stop";

export type RouteStopStatus =
  | "pending"
  | "en_route"
  | "in-transit"
  | "arrived"
  | "completed"
  | "skipped"
  | "cancelled"
  | "issue";

export type StopStatus = RouteStopStatus;

export type MarkerType = 'idea' | 'time' | 'email' | 'chart' | 'star' | 'rocket';

export type TaskType = 'drop-off' | 'pick-up' | 'swap' | 'service';

export interface RouteStopAddress {
  line1: string;
  line2?: string;
  city?: string;
  state?: string;
  postalCode?: string;
}

export interface RouteStop {
  id: string;
  uuid?: string;
  name?: string;
  title?: string;
  description?: string;
  address: string;
  status: RouteStopStatus;
  scheduledAt?: string;
  time?: string;
  etaMinutes?: number;
  eta?: string;
  scheduledWindowStart?: string;
  scheduledWindowEnd?: string;
  type?: MarkerType;
  taskType?: TaskType;
  sequence?: number;
  label?: string;
  color?: string;
  notes?: string;
  photos?: string[];
  coordinates: {
    lat: number;
    lng: number;
  };
  addressDetails?: RouteStopAddress;
  dumpsterSize?: string;
  dumpsterType?: string;
  dumpsterDescription?: string;
  travelDistanceMeters?: number;
  travelDurationSeconds?: number;
  remainingDistanceMeters?: number;
  remainingDurationSeconds?: number;
  routeDistanceMeters?: number;
  routeDurationSeconds?: number;
}

export interface RouteOverview {
  distanceMeters?: number;
  durationSeconds?: number;
  encodedPolyline?: string;
}

export interface RouteLegSummary {
  fromStopId: string;
  toStopId: string;
  distanceMeters?: number;
  durationSeconds?: number;
}

export interface RouteAssignment {
  uuid: string;
  label: string;
  status: 'assigned' | 'in_progress' | 'completed';
  stops: RouteStop[];
  dispatcherNote?: string;
}

export interface RoadmapDimensions {
  stopSpacing: number;
  pathHeight: number;
  roadWidth: number;
}

export interface AppMessage {
  id: string;
  type: 'info' | 'warning' | 'urgent';
  title: string;
  content: string;
  time: string;
}

// --- Walkthrough ---

export interface WalkthroughSlide {
  id: string;
  title: string;
  subtitle: string;
  description: string;
  illustration: string;
}

// --- Driver ---

export interface DriverProfile {
  name: string;
  email: string;
  phone?: string;
  vehicleId?: string;
}

export interface NotificationPreferences {
  routeAlerts: boolean;
  marketing: boolean;
  betaFeatures: boolean;
}

export interface DriverState {
  profile: DriverProfile;
  currentRoute?: RouteAssignment;
  isOnDuty: boolean;
}
