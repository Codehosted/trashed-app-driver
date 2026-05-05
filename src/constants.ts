import { RouteStop, AppMessage } from '@/types/domain';
import Constants from 'expo-constants';

export const COLORS = {
  red: '#ef4444',
  blue: '#3b82f6',
  teal: '#14b8a6',
  slate: '#64748b',
  orange: '#f97316',
  purple: '#8b5cf6',
  indigo: '#6366f1',
  pink: '#ec4899',
  green: '#10b981',
} as const;

export const MAP_CONFIG = {
  defaultZoom: 13,
  defaultZoomWebview: 15,
  tilt: 55,
  tileSize: 256,
} as const;

const getApiBaseUrl = (): string => {
  const apiUrl = Constants.expoConfig?.extra?.apiBaseUrl;
  if (apiUrl) return apiUrl;
  return 'https://trashed.ngrok.app';
};

export const APP_CONFIG = {
  apiBaseUrl: getApiBaseUrl(),
};

// Detroit Center approx: 42.3314° N, 83.0458° W
export const INITIAL_STOPS: RouteStop[] = [
  {
    uuid: '1',
    id: '1',
    name: 'Yard / HQ',
    title: 'Yard / HQ',
    description: 'Vehicle inspection and route pickup.',
    address: '1200 Industrial Ave',
    type: 'star',
    color: COLORS.slate,
    time: '07:00 AM',
    scheduledAt: '07:00 AM',
    status: 'pending',
    taskType: 'service',
    notes: '',
    photos: [],
    etaMinutes: 0,
    coordinates: { lat: 42.3314, lng: -83.0458 }
  },
  {
    uuid: '2',
    id: '2',
    name: 'Construction Site A',
    title: 'Construction Site A',
    description: 'Drop-off: 20-yard Roll-off for demolition debris.',
    address: '450 W Fort St',
    type: 'rocket',
    color: COLORS.blue,
    time: '08:30 AM',
    scheduledAt: '08:30 AM',
    status: 'pending',
    taskType: 'drop-off',
    notes: 'Gate code: 4590. Call foreman on arrival.',
    photos: [],
    etaMinutes: 30,
    coordinates: { lat: 42.3486, lng: -83.0405 }
  },
  {
    uuid: '3',
    id: '3',
    name: 'Residential Reno',
    title: 'Residential Reno',
    description: 'Pick-up: 12-yard Dumpster. Full concrete load.',
    address: '789 Woodward Ave',
    type: 'time',
    color: COLORS.orange,
    time: '10:00 AM',
    scheduledAt: '10:00 AM',
    status: 'pending',
    taskType: 'pick-up',
    notes: 'Driveway is tight, back in carefully.',
    photos: [],
    etaMinutes: 60,
    coordinates: { lat: 42.3620, lng: -83.0725 }
  },
  {
    uuid: '4',
    id: '4',
    name: 'Commercial Park',
    title: 'Commercial Park',
    description: 'Swap: Drop empty 30-yard, take full compactor.',
    address: '2200 Michigan Ave',
    type: 'idea',
    color: COLORS.purple,
    time: '01:00 PM',
    scheduledAt: '01:00 PM',
    status: 'pending',
    taskType: 'swap',
    notes: '',
    photos: [],
    etaMinutes: 120,
    coordinates: { lat: 42.3292, lng: -83.0782 }
  },
];

export const INITIAL_MESSAGES: AppMessage[] = [
  {
    id: 'm1',
    type: 'urgent',
    title: 'Traffic Alert',
    content: 'Heavy congestion on I-75 South. Expect delays.',
    time: '10 min ago'
  },
  {
    id: 'm2',
    type: 'info',
    title: 'Dispatcher',
    content: 'Customer at Stop #3 requested call ahead.',
    time: '25 min ago'
  },
  {
    id: 'm3',
    type: 'warning',
    title: 'Maintenance',
    content: 'Schedule oil change by EOW.',
    time: '1 hour ago'
  }
];
