import { ThemeMode, WalkthroughSlide } from '@/types/domain';

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
}

export const designSchema: DesignSchema = {
  theme: {
    light: {
      background: '#f4f7fb',
      surface: '#ffffff',
      card: '#dbe3ee',
      text: '#111827',
      subtleText: '#526071',
      accent: '#3b82f6',
      success: '#22c55e',
      warning: '#f59e0b',
      danger: '#ef4444',
    },
    dark: {
      background: '#101114',
      surface: '#181a20',
      card: '#262a33',
      text: '#f4f6fb',
      subtleText: '#a6adbb',
      accent: '#60a5fa',
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
};
