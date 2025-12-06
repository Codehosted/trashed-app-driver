import { LucideIcon } from 'lucide-react';

export type MarkerType = 'idea' | 'time' | 'email' | 'chart' | 'star' | 'rocket';
export type Theme = 'light' | 'dark';
export type StopStatus = 'pending' | 'in-transit' | 'arrived' | 'completed' | 'issue';
export type TaskType = 'drop-off' | 'pick-up' | 'swap' | 'service';

export interface RouteStop {
  id: string;
  title: string;
  description: string;
  address?: string;
  type: MarkerType;
  color: string;
  time?: string;
  status: StopStatus;
  taskType: TaskType;
  notes?: string;
  photos?: string[];
  coordinates: {
    lat: number;
    lng: number;
  };
}

export interface RoadmapDimensions {
  stopSpacing: number;
  pathHeight: number;
  roadWidth: number;
}

export interface NotificationPreferences {
  newAssignments: boolean;
  routeChanges: boolean;
  etaAlerts: boolean;
}

export interface AppMessage {
  id: string;
  type: 'info' | 'warning' | 'urgent';
  title: string;
  content: string;
  time: string;
}