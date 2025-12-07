import { ThemeMode, WalkthroughSlide, RouteAssignment } from '@/types/domain';

type Palette = {
  background: string;
  surface: string;
  card: string;
  text: string;
  subtleText: string;
  accent: string;
  success: string;
  warning: string;
  danger: string;
};

type ComponentBlueprint = {
  id: string;
  component: 'card' | 'button' | 'list' | 'chip' | 'map' | 'metric';
  variant?: string;
  props?: Record<string, unknown>;
};

export interface ScreenSchema {
  id: string;
  title: string;
  description: string;
  layout: {
    columns: number;
    spacing: number;
    components: ComponentBlueprint[];
  };
}

export interface DesignSchema {
  theme: Record<ThemeMode, Palette>;
  screens: ScreenSchema[];
  walkthrough: WalkthroughSlide[];
  sampleRoute: RouteAssignment;
}

export const designSchema: DesignSchema = {
  theme: {
    light: {
      background: '#f8fafc',
      surface: '#ffffff',
      card: '#e2e8f0',
      text: '#0f172a',
      subtleText: '#475569',
      accent: '#3b82f6',
      success: '#22c55e',
      warning: '#f59e0b',
      danger: '#ef4444',
    },
    dark: {
      background: '#0b172a',
      surface: '#111827',
      card: '#1f2937',
      text: '#e5e7eb',
      subtleText: '#94a3b8',
      accent: '#38bdf8',
      success: '#34d399',
      warning: '#fbbf24',
      danger: '#f87171',
    },
  },
  screens: [
    {
      id: 'map_dashboard',
      title: 'Route map dashboard',
      description: 'Map-first UI with driver status capsule and weather badge.',
      layout: {
        columns: 1,
        spacing: 12,
        components: [
          { id: 'mapView', component: 'map', variant: 'primary', props: { tilt: 55 } },
          { id: 'statusCard', component: 'card', variant: 'glow', props: { highlight: true } },
          { id: 'trafficBanner', component: 'chip', variant: 'alert' },
          { id: 'actions', component: 'button', variant: 'pill', props: { count: 3 } },
        ],
      },
    },
    {
      id: 'list_dashboard',
      title: 'List view with stops',
      description: 'Collapsible bottom sheet that mirrors the map state.',
      layout: {
        columns: 1,
        spacing: 8,
        components: [
          { id: 'stopList', component: 'list', variant: 'dense', props: { trailingMetric: true } },
          { id: 'etaChip', component: 'chip', variant: 'pill' },
        ],
      },
    },
    {
      id: 'messaging',
      title: 'In-app messaging',
      description: 'Banner and toast system for dispatch and safety alerts.',
      layout: {
        columns: 1,
        spacing: 10,
        components: [
          { id: 'messageCarousel', component: 'list', variant: 'carousel', props: { autoplay: true } },
          { id: 'toast', component: 'chip', variant: 'inline' },
        ],
      },
    },
  ],
  walkthrough: [
    {
      id: 'map',
      title: 'Map-first driving',
      subtitle: 'Arrive smarter',
      description: 'Stay centered on the live route with tilt, ETA chips, and arrival confirmations.',
      illustration: 'map',
    },
    {
      id: 'alerts',
      title: 'Trusted notifications',
      subtitle: 'Dispatch + device',
      description: 'Foreground and push alerts keep you ahead of traffic, weather, and job changes.',
      illustration: 'alert',
    },
    {
      id: 'checklist',
      title: 'Close out confidently',
      subtitle: 'Status webhooks',
      description: 'Every status update pings HQ with driver and route IDs for real-time visibility.',
      illustration: 'checklist',
    },
  ],
  sampleRoute: {
    uuid: 'route-demo-001',
    label: 'Detroit Loop',
    status: 'in_progress',
    dispatcherNote: 'Start at yard, confirm equipment swap, and capture site notes.',
    stops: [
      {
        uuid: 'stop-1',
        name: 'Yard / HQ',
        address: '1200 Industrial Ave',
        status: 'arrived',
        scheduledAt: '07:00 AM',
        etaMinutes: 0,
        coordinates: { lat: 42.3314, lng: -83.0458 },
      },
      {
        uuid: 'stop-2',
        name: 'Commercial Park',
        address: '2200 Michigan Ave',
        status: 'en_route',
        scheduledAt: '01:00 PM',
        etaMinutes: 14,
        coordinates: { lat: 42.3292, lng: -83.0782 },
      },
      {
        uuid: 'stop-3',
        name: 'Residential Reno',
        address: '789 Woodward Ave',
        status: 'pending',
        scheduledAt: '03:30 PM',
        etaMinutes: 42,
        coordinates: { lat: 42.3620, lng: -83.0725 },
      },
    ],
  },
};
