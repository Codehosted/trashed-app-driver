import React, { useState, useMemo, useEffect } from 'react';
import { AnimatePresence, motion, useDragControls, PanInfo } from 'framer-motion';
import { ChevronLeft, ChevronRight, List, Sparkles, Map, Plus, Minus, User as UserIcon, Settings, Play, Truck, Bell, Navigation, Car } from 'lucide-react';
import { INITIAL_STOPS, INITIAL_MESSAGES, MAP_CONFIG, APP_CONFIG } from './constants';
import { RouteStop, Theme } from './types';
import { RoadMap } from './components/RoadMap';
import { ListView } from './components/ListView';
import { InfoCard } from './components/InfoCard';
import { NotificationToast } from './components/NotificationToast';
import { WeatherWidget } from './components/WeatherWidget';
import { MessageCarousel } from './components/MessageCarousel';

// Firebase Imports - Updated to use local service shims
import { auth, requestNotificationPermission, onMessageListener, onAuthStateChanged, signOut } from './services/firebase';
import { User } from 'firebase/auth'; // Keep type import
import { Login } from './components/Login';
import { Profile } from './components/Profile';

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

export default function App() {
  // Auth State
  const [user, setUser] = useState<User | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [currentView, setCurrentView] = useState<'map' | 'profile'>('map');

  // App State
  const [stops, setStops] = useState<RouteStop[]>(INITIAL_STOPS);
  const [activeIndex, setActiveIndex] = useState(0);
  const [isListViewOpen, setIsListViewOpen] = useState(false);
  const [isRouteActive, setIsRouteActive] = useState(false); // Track route status
  const [theme, setTheme] = useState<Theme>('dark');
  const [zoom, setZoom] = useState(MAP_CONFIG.defaultZoom);
  
  // Initialize theme from URL query params
  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const themeParam = urlParams.get('theme') || urlParams.get('mode');
    if (themeParam === 'dark' || themeParam === 'light') {
      setTheme(themeParam);
    }
  }, []);
  
  // Real-time Geolocation State
  const [userLocation, setUserLocation] = useState<{lat: number, lng: number} | null>(null);
  
  // Notification State
  const [activeNotification, setActiveNotification] = useState<{title: string, body: string} | null>(null);

  // Initialize Auth & Notifications
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (currentUser: any) => {
      setUser(currentUser);
      setAuthLoading(false);
      
      // Request notifications on login
      if (currentUser) {
        requestNotificationPermission().catch(console.error);
      }
    });

    // Listen for foreground messages
    const listenForMessages = async () => {
        try {
            const payload: any = await onMessageListener();
            if (payload && payload.notification) {
                console.log('Foreground Message received: ', payload);
                setActiveNotification({
                    title: payload.notification.title || 'New Alert',
                    body: payload.notification.body || 'You have a new update.'
                });
            }
        } catch (err) {
            console.log('Message listener failed (likely no sw):', err);
        }
    };
    listenForMessages();

    return () => unsubscribe();
  }, []);

  // Real-time Location Tracking
  useEffect(() => {
    if ("geolocation" in navigator) {
      const id = navigator.geolocation.watchPosition(
        (position) => {
          const { latitude, longitude } = position.coords;
          setUserLocation({ lat: latitude, lng: longitude });
        },
        (error) => {
          console.log("Geolocation blocked or failed:", error);
        },
        { enableHighAccuracy: true, maximumAge: 10000, timeout: 5000 }
      );
      return () => navigator.geolocation.clearWatch(id);
    }
  }, []);

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
    
    // If setting to in-transit, assume route started
    if (updates.status === 'in-transit') {
        setIsRouteActive(true);
    }
  };

  const handleSignOut = async () => {
    await signOut(auth);
    setCurrentView('map');
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
            onBack={() => setCurrentView('map')} 
            onSignOut={handleSignOut} 
            onTestNotification={triggerTestNotification}
            theme={theme}
            onToggleTheme={toggleTheme}
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
      <div className="absolute top-0 left-0 p-3 z-20 pointer-events-none">
        <div>
            <h1 className={`text-2xl font-black tracking-tighter leading-none transition-colors ${theme === 'dark' ? 'text-white' : 'text-slate-900'}`}>
                trash<span className="text-indigo-600">ed</span>
            </h1>
            <p className="text-slate-400 text-[9px] font-bold uppercase tracking-widest pl-1">Driver Portal</p>
        </div>
      </div>

      {/* Weather Widget - Top Right */}
      <div className="absolute top-6 right-16 z-20 pointer-events-none">
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
      <div className="absolute top-6 right-6 z-30 flex flex-col items-end gap-2">
        
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