import React, { useState, useEffect } from 'react';
import { UserCircle, Save, ArrowLeft, Truck, Bell, Settings, Sun, Moon } from 'lucide-react';
import { NotificationPreferences, Theme } from '../types';

interface DriverUser {
  uid: string;
  email: string | null;
  displayName: string | null;
  photoURL: string | null;
}

interface ProfileProps {
  user: DriverUser | null;
  onBack: () => void;
  onSignOut: () => void;
  onTestNotification?: () => void;
  theme: Theme;
  onToggleTheme: () => void;
}

export const Profile: React.FC<ProfileProps> = ({ user, onBack, onSignOut, onTestNotification, theme, onToggleTheme }) => {
  const [loading, setLoading] = useState(false);
  const [driverData, setDriverData] = useState({
    vehicleModel: '',
    licensePlate: '',
    phoneNumber: ''
  });
  const [notificationPrefs, setNotificationPrefs] = useState<NotificationPreferences>({
    newAssignments: true,
    routeChanges: true,
    etaAlerts: false
  });
  
  const [message, setMessage] = useState('');

  // Load Data on Mount
  useEffect(() => {
    const fetchProfile = () => {
      try {
        const storedSettings = localStorage.getItem('driverSettings');
        if (storedSettings) {
          const data = JSON.parse(storedSettings);
          setDriverData({
            vehicleModel: data.vehicleModel || '',
            licensePlate: data.licensePlate || '',
            phoneNumber: data.phoneNumber || ''
          });
          if (data.notificationPreferences) {
            setNotificationPrefs(data.notificationPreferences);
          }
        }
      } catch (err) {
        console.error("Error loading local settings:", err);
      }
    };
    fetchProfile();
  }, [user]);

  // Save Data
  const handleSave = async () => {
    setLoading(true);
    try {
      const settingsToSave = {
        vehicleModel: driverData.vehicleModel,
        licensePlate: driverData.licensePlate,
        phoneNumber: driverData.phoneNumber,
        notificationPreferences: notificationPrefs
      };
      localStorage.setItem('driverSettings', JSON.stringify(settingsToSave));
      
      setMessage('Settings saved successfully!');
      setTimeout(() => setMessage(''), 3000);
    } catch (err) {
      console.error("Error saving settings:", err);
      setMessage('Failed to save settings.');
    }
    setLoading(false);
  };

  const togglePref = (key: keyof NotificationPreferences) => {
    setNotificationPrefs(prev => ({ ...prev, [key]: !prev[key] }));
  };

  return (
    <div className="h-screen w-full bg-slate-900 text-white p-6 md:p-12 overflow-y-auto custom-scrollbar">
        <div className="max-w-2xl mx-auto pb-20">
            {/* Header */}
            <div className="flex items-center gap-4 mb-8">
                <button 
                    onClick={onBack}
                    className="p-3 bg-slate-800 rounded-xl hover:bg-slate-700 transition-colors"
                >
                    <ArrowLeft size={20} />
                </button>
                <h1 className="text-2xl font-bold">{user ? 'Driver Profile' : 'App Settings'}</h1>
            </div>

            <div className="bg-slate-800/50 border border-slate-700 rounded-3xl p-8 shadow-xl backdrop-blur-sm space-y-8">
                
                {/* User Info Readonly - DIFFERENT FOR GUEST */}
                <div className="flex items-center gap-6 pb-8 border-b border-slate-700">
                    <div className="w-20 h-20 rounded-full overflow-hidden border-2 border-indigo-500 flex items-center justify-center bg-slate-700">
                        {user && user.photoURL ? (
                            <img src={user.photoURL} alt="User" className="w-full h-full object-cover" />
                        ) : (
                            user ? <UserCircle size={40} className="text-slate-500" /> : <Settings size={32} className="text-slate-400" />
                        )}
                    </div>
                    <div>
                        <h2 className="text-xl font-bold">{user ? (user.displayName || 'Driver') : 'Guest Driver'}</h2>
                        <p className="text-slate-400">{user ? user.email : 'Local Session'}</p>
                        {user && (
                             <p className="text-indigo-400 text-xs font-mono mt-1 bg-indigo-500/10 inline-block px-2 py-1 rounded">ID: {user.uid.slice(0,8)}...</p>
                        )}
                    </div>
                </div>

                {/* Vehicle Form */}
                <div className="space-y-6">
                    <h3 className="text-lg font-semibold flex items-center gap-2 text-slate-300">
                        <Truck size={18} className="text-indigo-400" /> Vehicle Details
                    </h3>
                    
                    <div className="grid md:grid-cols-2 gap-6">
                        <div>
                            <label className="block text-sm font-medium text-slate-400 mb-2">Vehicle Model</label>
                            <input 
                                type="text" 
                                value={driverData.vehicleModel}
                                onChange={(e) => setDriverData({...driverData, vehicleModel: e.target.value})}
                                placeholder="e.g. Ford Transit 2022"
                                className="w-full bg-slate-900 border border-slate-700 rounded-xl p-4 text-white focus:ring-2 focus:ring-indigo-500 outline-none transition-all"
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-slate-400 mb-2">License Plate</label>
                            <input 
                                type="text" 
                                value={driverData.licensePlate}
                                onChange={(e) => setDriverData({...driverData, licensePlate: e.target.value})}
                                placeholder="e.g. ABC-1234"
                                className="w-full bg-slate-900 border border-slate-700 rounded-xl p-4 text-white focus:ring-2 focus:ring-indigo-500 outline-none transition-all"
                            />
                        </div>
                    </div>
                    
                    <div>
                        <label className="block text-sm font-medium text-slate-400 mb-2">Phone Number</label>
                        <input 
                            type="tel" 
                            value={driverData.phoneNumber}
                            onChange={(e) => setDriverData({...driverData, phoneNumber: e.target.value})}
                            placeholder="+1 (555) 000-0000"
                            className="w-full bg-slate-900 border border-slate-700 rounded-xl p-4 text-white focus:ring-2 focus:ring-indigo-500 outline-none transition-all"
                        />
                    </div>
                </div>

                {/* Notification Settings */}
                <div className="pt-8 border-t border-slate-700 space-y-6">
                    <div className="flex items-center justify-between">
                        <h3 className="text-lg font-semibold flex items-center gap-2 text-slate-300">
                            <Bell size={18} className="text-indigo-400" /> Notification Settings
                        </h3>
                        {onTestNotification && (
                             <button 
                                onClick={onTestNotification}
                                className="text-xs bg-slate-700 hover:bg-slate-600 px-3 py-1 rounded-lg transition-colors"
                             >
                                Test Alert
                             </button>
                        )}
                    </div>

                    <div className="space-y-4">
                        <div className="flex items-center justify-between bg-slate-900/50 p-4 rounded-xl border border-slate-700/50">
                            <div>
                                <p className="font-medium">New Assignments</p>
                                <p className="text-xs text-slate-500">Get notified when new stops are added.</p>
                            </div>
                            <button 
                                onClick={() => togglePref('newAssignments')}
                                className={`w-12 h-6 rounded-full transition-colors relative ${notificationPrefs.newAssignments ? 'bg-indigo-600' : 'bg-slate-700'}`}
                            >
                                <div className={`absolute top-1 w-4 h-4 rounded-full bg-white transition-all ${notificationPrefs.newAssignments ? 'left-7' : 'left-1'}`} />
                            </button>
                        </div>

                        <div className="flex items-center justify-between bg-slate-900/50 p-4 rounded-xl border border-slate-700/50">
                            <div>
                                <p className="font-medium">Route Changes</p>
                                <p className="text-xs text-slate-500">Alerts for route optimizations or cancellations.</p>
                            </div>
                            <button 
                                onClick={() => togglePref('routeChanges')}
                                className={`w-12 h-6 rounded-full transition-colors relative ${notificationPrefs.routeChanges ? 'bg-indigo-600' : 'bg-slate-700'}`}
                            >
                                <div className={`absolute top-1 w-4 h-4 rounded-full bg-white transition-all ${notificationPrefs.routeChanges ? 'left-7' : 'left-1'}`} />
                            </button>
                        </div>

                        <div className="flex items-center justify-between bg-slate-900/50 p-4 rounded-xl border border-slate-700/50">
                            <div>
                                <p className="font-medium">ETA Alerts</p>
                                <p className="text-xs text-slate-500">Notifications for arrival time updates.</p>
                            </div>
                            <button 
                                onClick={() => togglePref('etaAlerts')}
                                className={`w-12 h-6 rounded-full transition-colors relative ${notificationPrefs.etaAlerts ? 'bg-indigo-600' : 'bg-slate-700'}`}
                            >
                                <div className={`absolute top-1 w-4 h-4 rounded-full bg-white transition-all ${notificationPrefs.etaAlerts ? 'left-7' : 'left-1'}`} />
                            </button>
                        </div>
                    </div>
                </div>

                {/* Theme Settings */}
                <div className="pt-8 border-t border-slate-700 space-y-6">
                    <h3 className="text-lg font-semibold flex items-center gap-2 text-slate-300">
                        {theme === 'dark' ? <Moon size={18} className="text-indigo-400" /> : <Sun size={18} className="text-indigo-400" />} Appearance
                    </h3>

                    <div className="flex items-center justify-between bg-slate-900/50 p-4 rounded-xl border border-slate-700/50">
                        <div>
                            <p className="font-medium">Theme</p>
                            <p className="text-xs text-slate-500">Switch between light and dark mode.</p>
                        </div>
                        <button 
                            onClick={onToggleTheme}
                            className={`w-12 h-6 rounded-full transition-colors relative flex items-center ${theme === 'dark' ? 'bg-indigo-600' : 'bg-slate-700'}`}
                        >
                            <div className={`absolute top-1 w-4 h-4 rounded-full bg-white transition-all flex items-center justify-center ${theme === 'dark' ? 'left-7' : 'left-1'}`}>
                                {theme === 'dark' ? <Moon size={10} className="text-indigo-600" /> : <Sun size={10} className="text-slate-700" />}
                            </div>
                        </button>
                    </div>
                </div>

                {message && (
                    <div className={`mt-6 p-4 rounded-xl text-sm font-medium ${message.includes('success') ? 'bg-emerald-500/10 text-emerald-400' : 'bg-red-500/10 text-red-400'}`}>
                        {message}
                    </div>
                )}

                <div className="mt-8 flex gap-4">
                    <button 
                        onClick={handleSave}
                        disabled={loading}
                        className="flex-1 bg-indigo-600 hover:bg-indigo-500 text-white font-bold py-4 rounded-xl flex items-center justify-center gap-2 transition-all active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        {loading ? 'Saving...' : <><Save size={18} /> Save Changes</>}
                    </button>
                    
                    {user && (
                        <button 
                            onClick={onSignOut}
                            className="px-6 border border-slate-600 hover:bg-slate-800 text-slate-300 font-bold py-4 rounded-xl transition-all"
                        >
                            Sign Out
                        </button>
                    )}
                </div>
            </div>
        </div>
    </div>
  );
};