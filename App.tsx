import React, { useState, useMemo, useEffect, useRef } from 'react';
import { AnimatePresence, motion, PanInfo } from 'framer-motion';
import { ChevronLeft, ChevronRight, List, Plus, Minus, User as UserIcon, Settings, Truck, Bell, LayoutDashboard, Route as RouteIcon } from 'lucide-react';
import { INITIAL_STOPS, INITIAL_MESSAGES, MAP_CONFIG, APP_CONFIG } from './constants';
import { RouteStop, Theme } from './types';
import { RoadMap } from './components/RoadMap';
import { ListView } from './components/ListView';
import { InfoCard } from './components/InfoCard';
import { NotificationToast } from './components/NotificationToast';
import { WeatherWidget } from './components/WeatherWidget';
import { MessageCarousel } from './components/MessageCarousel';

import { Login } from './components/Login';
import { Profile } from './components/Profile';
import { VendorExperienceWebView } from './components/VendorExperienceWebView';
import { getDefaultDriverRouteUuid } from './services/appConfig';
import { startBackgroundDriverTracking, stopBackgroundDriverTracking, type BackgroundDriverTrackingController } from './services/backgroundLocationTracking';

interface DriverUser {
  uid: string;
  email: string | null;
  displayName: string | null;
  photoURL: string | null;
}

// Haversine Distance Helper
function getDistance(lat1: number, lon1: number, lat2: number, lon2: number) {
  const R = 6371; // km
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
            Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
            Math.sin(dLon/2) * Math.sin(dLon/2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  return R * c; // Distance in km
}

function isRouteTrackingActive(stops: RouteStop[]) {
  return stops.some(stop => stop.status === 'in-transit' || stop.status === 'arrived');
}

export default function App() {
  // Auth State
  const [user, setUser] = useState<DriverUser | null>(null);
  const [authLoading] = useState(false);
  const initialView = (import.meta.env.VITE_LOCAL_E2E_INITIAL_VIEW as 'driverMap' | 'profile' | 'vendorDashboard' | 'vendorDispatch' | undefined) || 'driverMap';
  const [currentView, setCurrentView] = useState<'driverMap' | 'profile' | 'vendorDashboard' | 'vendorDispatch'>(initialView);

  // App State
  const [stops, setStops] = useState<RouteStop[]>(INITIAL_STOPS);
  const [activeIndex, setActiveIndex] = useState(0);
  const [isListViewOpen, setIsListViewOpen] = useState(false);
  const isRouteActive = useMemo(() => isRouteTrackingActive(stops), [stops]);
  const [theme, setTheme] = useState<Theme>('dark');
  const [zoom, setZoom] = useState(MAP_CONFIG.defaultZoom);

  // Initialize theme and route context from URL query params
  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const themeParam = urlParams.get('theme') || urlParams.get('mode');
    if (themeParam === 'dark' || themeParam === 'light') {
      setTheme(themeParam);
    }
    activeRouteUuidRef.current = getDefaultDriverRouteUuid();
  }, []);

  // Real-time Geolocation State
  const [userLocation, setUserLocation] = useState<{lat: number, lng: number} | null>(null);
  const activeRouteUuidRef = useRef<string | null>(null);

  // Notification State
  const [activeNotification, setActiveNotification] = useState<{title: string, body: string} | null>(null);

  // Mobile runtime deliberately avoids Firebase. Driver location flows use
  // SpacetimeDB/existing Trashed APIs; local alert UI is driven by app state.

  // Background-capable driver location tracking.
  // Native builds use a foreground-service watcher so active routes keep sending beacons
  // when the app is backgrounded; browser preview falls back to navigator.geolocation.
  useEffect(() => {
    if (!isRouteActive) return;

    const routeUuid = activeRouteUuidRef.current || getDefaultDriverRouteUuid();
    if (!routeUuid) {
      console.log('Driver tracking skipped: route UUID is not available.');
      return;
    }

    let cancelled = false;
    let controller: BackgroundDriverTrackingController | null = null;

    void startBackgroundDriverTracking({
      routeUuid,
      onLocation: (location) => setUserLocation({ lat: location.lat, lng: location.lng }),
      onError: (error) => console.log('Driver background tracking warning:', error.message),
    }).then((trackingController) => {
      if (cancelled) {
        void stopBackgroundDriverTracking(trackingController);
        return;
      }
      controller = trackingController;
    }).catch((error) => {
      console.log('Driver background tracking failed to start:', error);
    });

    return () => {
      cancelled = true;
      void stopBackgroundDriverTracking(controller);
    };
  }, [isRouteActive]);

  // Derived Travel Metrics (ETA)
  const travelStats = useMemo(() => {
    if (activeIndex === 0 && !userLocation) return { distance: undefined, driveTime: undefined };

    // Target is always the active index
    const target = stops[activeIndex];

    // Origin is User Location (if available) OR Previous Stop
    const origin = userLocation || (activeIndex > 0 ? stops[activeIndex - 1].coordinates : null);

    if (!origin) return { distance: undefined, driveTime: undefined };

    const km = getDistance(origin.lat, origin.lng, target.coordinates.lat, target.coordinates.lng);
    // Rough estimate: 50km/h avg speed for city driving + truck factor
    const speed = km > 10 ? 50 : 25;
    const mins = Math.round((km / speed) * 60);
    const hours = Math.floor(mins / 60);
    const remainingMins = mins % 60;

    let timeString = `${mins} min`;
    if (hours > 0) {
        timeString = `${hours}h ${remainingMins}m`;
    }

    return {
        distance: km < 1 ? `${Math.round(km * 1000)} m` : `${km.toFixed(1)} km`,
        driveTime: timeString
    };
  }, [activeIndex, stops, userLocation]);

  const handleNext = () => {
    if (activeIndex < stops.length - 1) {
      setActiveIndex(prev => prev + 1);
    }
  };

  const handlePrev = () => {
    if (activeIndex > 0) {
      setActiveIndex(prev => prev - 1);
    }
  };

  const toggleTheme = () => setTheme(prev => prev === 'dark' ? 'light' : 'dark');

  const onDragEnd = (event: MouseEvent | TouchEvent | PointerEvent, info: PanInfo) => {
    const threshold = 50;
    if (info.offset.x < -threshold) {
        handleNext();
    } else if (info.offset.x > threshold) {
        handlePrev();
    }
  };

  const handleUpdateStop = (id: string, updates: Partial<RouteStop>) => {
    setStops(prev => prev.map(stop => stop.id === id ? { ...stop, ...updates } : stop));
  };

  const handleSignOut = async () => {
    setUser(null);
    setCurrentView('driverMap');
  };

  const triggerTestNotification = () => {
    setActiveNotification({
        title: 'New Assignment Received',
        body: 'A new priority stop has been added to your route.'
    });
  };

  // --- Auth & Routing Logic ---

  if (APP_CONFIG.enableAuth && authLoading) {
    return <div className="min-h-screen bg-slate-900 flex items-center justify-center text-white">Loading...</div>;
  }

  if (APP_CONFIG.enableAuth && !user) {
    return <Login />;
  }

  if (currentView === 'profile') {
    return (
        <Profile
            user={user}
            onBack={() => setCurrentView('driverMap')}
            onSignOut={handleSignOut}
            onTestNotification={triggerTestNotification}
            theme={theme}
            onToggleTheme={toggleTheme}
        />
    );
  }

  if (currentView === 'vendorDashboard' || currentView === 'vendorDispatch') {
    return (
      <VendorExperienceWebView
        initialTarget={currentView === 'vendorDispatch' ? 'dispatch' : 'dashboard'}
        theme={theme}
        onBackToDriverMap={() => setCurrentView('driverMap')}
      />
    );
  }

  // --- Main Map Dashboard ---

  return (
    <div className={`relative w-full h-screen overflow-hidden font-sans selection:bg-indigo-500/30 ${theme === 'dark' ? 'bg-slate-900' : 'bg-slate-50'}`}>

      {/* Notifications Overlay */}
      <NotificationToast
        notification={activeNotification}
        onClose={() => setActiveNotification(null)}
      />

      {/* Top Overlay Gradient */}
      <div className={`absolute top-0 w-full h-32 bg-gradient-to-b z-10 pointer-events-none transition-colors duration-500 ${
        theme === 'dark' ? 'from-slate-900 to-transparent' : 'from-slate-100 to-transparent'
      }`} />

      {/* Branding */}
      <div
        className="absolute left-0 p-3 z-20 pointer-events-none"
        style={{ top: 'env(safe-area-inset-top, 0px)' }}
      >
        <div>
            <h1 className={`text-2xl font-black tracking-tighter leading-none transition-colors ${theme === 'dark' ? 'text-white' : 'text-slate-900'}`}>
                trash<span className="text-indigo-600">ed</span>
            </h1>
            <p className="text-slate-400 text-[9px] font-bold uppercase tracking-widest pl-1">Driver Portal</p>
        </div>
      </div>

      {/* Weather Widget - Top Right */}
      <div
        className="absolute right-16 z-20 pointer-events-none"
        style={{ top: 'calc(env(safe-area-inset-top, 0px) + 1.5rem)' }}
      >
         <WeatherWidget theme={theme} />
      </div>

      {/* Main 3D Map View Area */}
      <motion.div
        className="w-full h-full cursor-grab active:cursor-grabbing"
        drag="x"
        dragConstraints={{ left: 0, right: 0 }}
        dragElastic={0.2}
        onDragEnd={onDragEnd}
      >
        <RoadMap
            stops={stops}
            activeIndex={activeIndex}
            onStopClick={setActiveIndex}
            theme={theme}
            zoom={zoom}
            userLocation={userLocation}
        />
      </motion.div>

      {/* Navigation Hints (Side Chevrons) */}
      <AnimatePresence>
        {activeIndex > 0 && (
            <motion.div
                initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0 }}
                className="absolute left-4 top-1/2 -translate-y-1/2 z-20 pointer-events-none"
            >
                <div className={`p-2.5 rounded-full backdrop-blur-sm animate-pulse ${theme === 'dark' ? 'bg-white/5 text-white' : 'bg-black/5 text-slate-900'}`}>
                    <ChevronLeft size={24} strokeWidth={2.5} />
                </div>
            </motion.div>
        )}
        {activeIndex < stops.length - 1 && (
            <motion.div
                initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0 }}
                className="absolute right-4 top-1/2 -translate-y-1/2 z-20 pointer-events-none"
            >
                <div className={`p-2.5 rounded-full backdrop-blur-sm animate-pulse ${theme === 'dark' ? 'bg-white/5 text-white' : 'bg-black/5 text-slate-900'}`}>
                    <ChevronRight size={24} strokeWidth={2.5} />
                </div>
            </motion.div>
        )}
      </AnimatePresence>

      {/* Center Info Card */}
      <InfoCard
        stop={stops[activeIndex]}
        index={activeIndex}
        theme={theme}
        distance={travelStats.distance}
        driveTime={travelStats.driveTime}
        onUpdateStop={handleUpdateStop}
      />

      {/* Message Carousel - Bottom Center (Replaces Control Bar) */}
      <MessageCarousel messages={INITIAL_MESSAGES} theme={theme} />

      {/* Right Side Controls Stack */}
      <div
        className="absolute right-6 z-30 flex flex-col items-end gap-2"
        style={{ top: 'calc(env(safe-area-inset-top, 0px) + 1.5rem)' }}
      >

        {/* Profile & List Group */}
        <div className="flex flex-col gap-2">
            <button
                data-native-action="openProfile"
                onClick={() => setCurrentView('profile')}
                className={`w-9 h-9 backdrop-blur border rounded-full shadow-lg flex items-center justify-center transition-colors overflow-hidden ${
                    theme === 'dark'
                    ? 'bg-slate-800/80 border-slate-700 text-white hover:bg-slate-700'
                    : 'bg-white/80 border-slate-200 text-slate-700 hover:bg-slate-50'
                }`}
            >
                {user ? (
                    user.photoURL ? (
                        <img src={user.photoURL} alt="Profile" className="w-full h-full object-cover" />
                    ) : (
                        <UserIcon size={16} />
                    )
                ) : (
                    <Settings size={16} />
                )}
            </button>

            <button
                onClick={() => setIsListViewOpen(true)}
                className={`w-9 h-9 backdrop-blur border rounded-full shadow-lg flex items-center justify-center transition-colors ${
                    theme === 'dark'
                    ? 'bg-slate-800/80 border-slate-700 text-white hover:bg-slate-700'
                    : 'bg-white/80 border-slate-200 text-slate-700 hover:bg-slate-50'
                }`}
            >
                <List size={16} />
            </button>

            <button
                data-native-action="openVendorDashboard"
                onClick={() => setCurrentView('vendorDashboard')}
                className={`w-9 h-9 backdrop-blur border rounded-full shadow-lg flex items-center justify-center transition-colors ${
                    theme === 'dark'
                    ? 'bg-slate-800/80 border-slate-700 text-white hover:bg-slate-700'
                    : 'bg-white/80 border-slate-200 text-slate-700 hover:bg-slate-50'
                }`}
                aria-label="Open vendor dashboard"
            >
                <LayoutDashboard size={16} />
            </button>

            <button
                data-native-action="openVendorDispatch"
                onClick={() => setCurrentView('vendorDispatch')}
                className={`w-9 h-9 backdrop-blur border rounded-full shadow-lg flex items-center justify-center transition-colors ${
                    theme === 'dark'
                    ? 'bg-slate-800/80 border-slate-700 text-white hover:bg-slate-700'
                    : 'bg-white/80 border-slate-200 text-slate-700 hover:bg-slate-50'
                }`}
                aria-label="Open vendor dispatch"
            >
                <RouteIcon size={16} />
            </button>
        </div>

        {/* Zoom Controls */}
        <div className={`flex flex-col rounded-full shadow-lg border backdrop-blur mt-2 overflow-hidden ${
             theme === 'dark'
             ? 'bg-slate-800/80 border-slate-700'
             : 'bg-white/80 border-slate-200'
        }`}>
            <button
                onClick={() => setZoom(z => Math.min(z + 1, 18))}
                className={`w-9 h-9 flex items-center justify-center transition-colors border-b ${
                    theme === 'dark' ? 'text-white hover:bg-slate-700 border-slate-700' : 'text-slate-700 hover:bg-slate-50 border-slate-200'
                }`}
            >
                <Plus size={14} />
            </button>
            <button
                onClick={() => setZoom(z => Math.max(z - 1, 10))}
                className={`w-9 h-9 flex items-center justify-center transition-colors ${
                    theme === 'dark' ? 'text-white hover:bg-slate-700' : 'text-slate-700 hover:bg-slate-50'
                }`}
            >
                <Minus size={14} />
            </button>
        </div>

        {/* Alerts Icon */}
        <button
            className={`w-9 h-9 rounded-full shadow-lg border backdrop-blur flex items-center justify-center transition-all mt-2 relative ${
                theme === 'dark'
                ? 'bg-slate-800/80 border-slate-700 text-white hover:bg-slate-700'
                : 'bg-white/80 border-slate-200 text-slate-800 hover:bg-slate-50'
            }`}
        >
            <Bell size={16} />
            <span className="absolute top-1.5 right-2.5 w-1.5 h-1.5 bg-red-500 rounded-full border border-slate-800"></span>
        </button>

      </div>

      {/* List View Overlay */}
      <AnimatePresence>
        {isListViewOpen && (
            <>
                <motion.div
                    initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                    className="absolute inset-0 bg-black/60 z-40 backdrop-blur-sm"
                    onClick={() => setIsListViewOpen(false)}
                />
                <ListView
                    stops={stops}
                    activeIndex={activeIndex}
                    onSelect={(i) => { setActiveIndex(i); setIsListViewOpen(false); }}
                    onClose={() => setIsListViewOpen(false)}
                    theme={theme}
                />
            </>
        )}
      </AnimatePresence>

    </div>
  );
}
