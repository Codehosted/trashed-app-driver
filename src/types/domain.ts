export type ThemeMode = 'light' | 'dark';
export type Theme = 'light' | 'dark'; // Alias for compatibility

export type MarkerType = 'idea' | 'time' | 'email' | 'chart' | 'star' | 'rocket';
export type StopStatus = 'pending' | 'in-transit' | 'arrived' | 'completed' | 'skipped' | 'en_route';
export type TaskType = 'drop-off' | 'pick-up' | 'swap' | 'service';

export interface DriverProfile {
  uuid: string;
  name: string;
  email: string;
  phone: string;
  preferredTheme: ThemeMode;
  notificationPreferences: NotificationPreferences;
}

export interface RouteStop {
  uuid: string;
  id?: string; // Legacy support
  name: string;
  title?: string; // Legacy support
  description?: string;
  address: string;
  status: StopStatus;
  scheduledAt: string;
  time?: string; // Legacy support
  etaMinutes: number;
  type?: MarkerType;
  color?: string;
  taskType?: TaskType;
  notes?: string;
  photos?: string[];
  coordinates: {
    lat: number;
    lng: number;
  };
}

export interface RouteAssignment {
  uuid: string;
  label: string;
  status: 'assigned' | 'in_progress' | 'completed';
  stops: RouteStop[];
  dispatcherNote?: string;
}

export interface NotificationPreferences {
  routeAlerts: boolean;
  marketing: boolean;
  betaFeatures: boolean;
  newAssignments?: boolean; // Legacy support
  routeChanges?: boolean; // Legacy support
  etaAlerts?: boolean; // Legacy support
}

export interface DriverState {
  driver: DriverProfile | null;
  currentRoute: RouteAssignment | null;
}

export type WalkthroughSlide = {
  id: string;
  title: string;
  subtitle: string;
  description: string;
  illustration: 'map' | 'alert' | 'checklist';
};

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
