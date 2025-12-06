import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { RouteStop, Theme, StopStatus } from '../types';
import { Navigation, Camera, CheckCircle, Clock, MapPin, Edit3, Car, X } from 'lucide-react';

interface InfoCardProps {
  stop: RouteStop;
  index: number;
  theme: Theme;
  onUpdateStop: (id: string, updates: Partial<RouteStop>) => void;
  distance?: string;
  driveTime?: string;
}

export const InfoCard: React.FC<InfoCardProps> = ({ stop, index, theme, onUpdateStop, distance, driveTime }) => {
  const isDark = theme === 'dark';
  const [showPhotosPopup, setShowPhotosPopup] = useState(false);
  const [showNotesPopup, setShowNotesPopup] = useState(false);
  const [tempNotes, setTempNotes] = useState(stop.notes || '');

  // Consistent avatar generation
  const avatarUrl = `https://api.dicebear.com/9.x/avataaars/svg?seed=${stop.id}`;
  
  // Check if active for the glow effect
  const isActive = stop.status === 'in-transit' || stop.status === 'arrived';
  const isCompleted = stop.status === 'completed';

  const handleStatusChange = () => {
    let nextStatus: StopStatus = 'pending';
    if (stop.status === 'pending') nextStatus = 'in-transit';
    else if (stop.status === 'in-transit') nextStatus = 'arrived';
    else if (stop.status === 'arrived') nextStatus = 'completed';
    
    onUpdateStop(stop.id, { status: nextStatus });
  };

  const handleAddPhoto = () => {
    const newPhoto = `https://picsum.photos/seed/${Date.now()}/200`;
    onUpdateStop(stop.id, { photos: [...(stop.photos || []), newPhoto] });
  };

  const handleDeletePhoto = (photoIndex: number) => {
    const updatedPhotos = stop.photos?.filter((_, i) => i !== photoIndex) || [];
    onUpdateStop(stop.id, { photos: updatedPhotos });
  };

  const saveNotes = () => {
    onUpdateStop(stop.id, { notes: tempNotes });
    setShowNotesPopup(false);
  };

  const handleOpenNotes = () => {
    setTempNotes(stop.notes || '');
    setShowNotesPopup(true);
  };

  return (
    <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-[160px] z-40 pointer-events-none w-full flex justify-center">
      <AnimatePresence mode="wait">
        <motion.div
            key={stop.id}
            initial={{ opacity: 0, y: 20, scale: 0.9 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -20, scale: 0.9 }}
            transition={{ type: "spring", stiffness: 300, damping: 25 }}
            className="relative"
        >
            {/* MAIN CARD CONTAINER */}
            <div className={`
                w-[90vw] max-w-[280px] pointer-events-auto backdrop-blur-xl shadow-2xl rounded-2xl p-4 pt-12 flex flex-col items-center relative transition-all duration-500
                ${isDark ? 'bg-slate-900/95' : 'bg-white/95'}
                ${isActive 
                    ? 'border-2 border-emerald-400 shadow-[0_0_50px_rgba(52,211,153,0.3)]' 
                    : `border ${isDark ? 'border-slate-700/50' : 'border-white/60'}`
                }
            `}>
                
                {/* CENTERED AVATAR (Popping out) */}
                <div className="absolute -top-10 left-1/2 transform -translate-x-1/2 z-10">
                    <div className={`w-16 h-16 rounded-full border-4 shadow-xl overflow-hidden bg-slate-100 relative ${isDark ? 'border-slate-900' : 'border-white'}`}>
                        <img src={avatarUrl} alt="Avatar" className="w-full h-full object-cover" />
                    </div>
                    
                    {/* Status Pip */}
                    <div className={`absolute bottom-0.5 right-0.5 w-5 h-5 rounded-full border-2 ${isDark ? 'border-slate-900' : 'border-white'} flex items-center justify-center shadow-sm ${
                        stop.status === 'completed' ? 'bg-emerald-500' :
                        stop.status === 'in-transit' ? 'bg-blue-500' :
                        stop.status === 'arrived' ? 'bg-amber-500' : 'bg-slate-500'
                    }`}>
                        {stop.status === 'completed' ? <CheckCircle size={8} className="text-white" /> :
                         stop.status === 'in-transit' ? <Navigation size={8} className="text-white" /> :
                         stop.status === 'arrived' ? <MapPin size={8} className="text-white" /> : null}
                    </div>
                </div>

                {/* CONTENT BODY */}
                <div className="text-center w-full space-y-2 max-h-[55vh] overflow-y-auto custom-scrollbar px-1 pb-1">
                    
                    {/* INTERNAL HEADER: Stop Number & Time */}
                    <div className="flex items-center justify-center gap-1.5 mt-0.5">
                        <span className={`px-1.5 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider border ${isDark ? 'bg-indigo-500/10 border-indigo-500/30 text-indigo-400' : 'bg-indigo-50 border-indigo-100 text-indigo-600'}`}>
                            Stop #{index + 1}
                        </span>
                        {stop.time && (
                            <span className={`flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] font-bold border ${isDark ? 'bg-slate-800 border-slate-700 text-slate-400' : 'bg-slate-100 border-slate-200 text-slate-500'}`}>
                                <Clock size={9} /> {stop.time}
                            </span>
                        )}
                    </div>

                    {/* Title & Address */}
                    <div>
                        <h1 className={`text-xl font-bold leading-tight ${isDark ? 'text-white' : 'text-slate-900'}`}>
                            {stop.title}
                        </h1>
                        <div className="flex items-center justify-center gap-1 text-[10px] font-medium text-slate-500 mt-0.5">
                            {stop.taskType && (
                                <span className="uppercase tracking-wider text-indigo-500 bg-indigo-500/10 px-1.5 py-0.5 rounded">
                                    {stop.taskType}
                                </span>
                            )}
                            {stop.address && <span>• {stop.address}</span>}
                        </div>
                    </div>

                    <p className={`text-xs leading-relaxed px-1 ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>
                        {stop.description}
                    </p>

                    {/* ETA Display (Only if relevant) */}
                    {(distance || driveTime) && !isCompleted && (
                        <div className="flex justify-center gap-3 py-0.5">
                            {distance && (
                                <div className={`flex items-center gap-1 text-[10px] font-bold ${isDark ? 'text-emerald-400' : 'text-emerald-600'}`}>
                                    <Navigation size={10} /> {distance}
                                </div>
                            )}
                            {driveTime && (
                                <div className={`flex items-center gap-1 text-[10px] font-bold ${isDark ? 'text-amber-400' : 'text-amber-600'}`}>
                                    <Car size={10} /> {driveTime}
                                </div>
                            )}
                        </div>
                    )}

                    {/* MAIN WORKFLOW BUTTON */}
                    {!isCompleted && (
                        <button 
                            onClick={handleStatusChange}
                            className={`w-full py-2.5 rounded-xl font-bold text-white shadow-lg flex items-center justify-center gap-1.5 transition-transform active:scale-95 text-sm ${
                                stop.status === 'pending' ? 'bg-indigo-600 hover:bg-indigo-500 shadow-indigo-500/25' :
                                stop.status === 'in-transit' ? 'bg-amber-600 hover:bg-amber-500 shadow-amber-500/25' :
                                'bg-emerald-600 hover:bg-emerald-500 shadow-emerald-500/25'
                            }`}
                        >
                            {stop.status === 'pending' && <>Start Route <Navigation size={14} /></>}
                            {stop.status === 'in-transit' && <>Arrived at Site <MapPin size={14} /></>}
                            {stop.status === 'arrived' && <>Complete Job <CheckCircle size={14} /></>}
                        </button>
                    )}

                    {/* Photos & Notes Icon Buttons */}
                    <div className="flex items-center justify-center gap-3 mt-1.5">
                        {/* Photos Icon Button */}
                        <button
                            onClick={() => setShowPhotosPopup(true)}
                            className={`relative p-2.5 rounded-full border backdrop-blur transition-all ${
                                isDark 
                                ? 'bg-slate-800/80 border-slate-700 text-white hover:bg-slate-700' 
                                : 'bg-white/80 border-slate-200 text-slate-700 hover:bg-slate-50'
                            }`}
                        >
                            <Camera size={16} />
                            {stop.photos && stop.photos.length > 0 && (
                                <span className={`absolute -top-1 -right-1 w-4 h-4 rounded-full flex items-center justify-center text-[8px] font-bold ${
                                    isDark ? 'bg-indigo-500 text-white' : 'bg-indigo-600 text-white'
                                }`}>
                                    {stop.photos.length}
                                </span>
                            )}
                        </button>

                        {/* Notes Icon Button */}
                        <button
                            onClick={handleOpenNotes}
                            className={`relative p-2.5 rounded-full border backdrop-blur transition-all ${
                                isDark 
                                ? 'bg-slate-800/80 border-slate-700 text-white hover:bg-slate-700' 
                                : 'bg-white/80 border-slate-200 text-slate-700 hover:bg-slate-50'
                            }`}
                        >
                            <Edit3 size={16} />
                            {stop.notes && (
                                <span className={`absolute -top-1 -right-1 w-2 h-2 rounded-full ${
                                    isDark ? 'bg-indigo-500' : 'bg-indigo-600'
                                }`} />
                            )}
                        </button>
                    </div>
                </div>
            </div>
        </motion.div>
      </AnimatePresence>

      {/* Photos Popup */}
      <AnimatePresence>
        {showPhotosPopup && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 bg-black/60 z-50 backdrop-blur-sm"
              onClick={() => setShowPhotosPopup(false)}
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              className={`fixed top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 z-50 w-[90vw] max-w-sm ${
                isDark ? 'bg-slate-900' : 'bg-white'
              } rounded-2xl shadow-2xl border ${isDark ? 'border-slate-700' : 'border-slate-200'}`}
              onClick={(e) => e.stopPropagation()}
            >
              <div className={`p-4 border-b flex justify-between items-center ${isDark ? 'border-slate-700' : 'border-slate-200'}`}>
                <h3 className={`font-bold ${isDark ? 'text-white' : 'text-slate-900'}`}>Photos</h3>
                <button
                  onClick={() => setShowPhotosPopup(false)}
                  className={`p-1 rounded-full transition-colors ${isDark ? 'hover:bg-slate-800 text-slate-400' : 'hover:bg-slate-100 text-slate-500'}`}
                >
                  <X size={18} />
                </button>
              </div>
              <div className="p-4">
                {stop.photos && stop.photos.length > 0 ? (
                  <div className="grid grid-cols-3 gap-3 mb-4">
                    {stop.photos.map((photo, i) => (
                      <div key={i} className="relative group">
                        <img
                          src={photo}
                          alt={`Photo ${i + 1}`}
                          className="w-full aspect-square rounded-lg object-cover"
                        />
                        <button
                          onClick={() => handleDeletePhoto(i)}
                          className="absolute top-1 right-1 p-1 bg-red-500 text-white rounded-full opacity-0 group-hover:opacity-100 transition-opacity"
                        >
                          <X size={12} />
                        </button>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className={`text-center py-8 ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                    <Camera size={32} className="mx-auto mb-2 opacity-50" />
                    <p className="text-sm">No photos added yet</p>
                  </div>
                )}
                <button
                  onClick={handleAddPhoto}
                  className={`w-full py-2.5 rounded-xl font-bold text-white bg-indigo-600 hover:bg-indigo-500 transition-colors flex items-center justify-center gap-2`}
                >
                  <Camera size={16} />
                  Add Photo
                </button>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* Notes Popup */}
      <AnimatePresence>
        {showNotesPopup && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 bg-black/60 z-50 backdrop-blur-sm"
              onClick={() => setShowNotesPopup(false)}
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              className={`fixed top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 z-50 w-[90vw] max-w-sm ${
                isDark ? 'bg-slate-900' : 'bg-white'
              } rounded-2xl shadow-2xl border ${isDark ? 'border-slate-700' : 'border-slate-200'}`}
              onClick={(e) => e.stopPropagation()}
            >
              <div className={`p-4 border-b flex justify-between items-center ${isDark ? 'border-slate-700' : 'border-slate-200'}`}>
                <h3 className={`font-bold ${isDark ? 'text-white' : 'text-slate-900'}`}>Notes</h3>
                <button
                  onClick={() => setShowNotesPopup(false)}
                  className={`p-1 rounded-full transition-colors ${isDark ? 'hover:bg-slate-800 text-slate-400' : 'hover:bg-slate-100 text-slate-500'}`}
                >
                  <X size={18} />
                </button>
              </div>
              <div className="p-4">
                <textarea
                  className={`w-full h-40 p-3 rounded-xl border resize-none outline-none ${
                    isDark 
                    ? 'bg-slate-800 border-slate-700 text-white placeholder-slate-500' 
                    : 'bg-slate-50 border-slate-200 text-slate-900 placeholder-slate-400'
                  }`}
                  value={tempNotes}
                  onChange={(e) => setTempNotes(e.target.value)}
                  placeholder="Add driver notes..."
                  autoFocus
                />
                <div className="flex gap-2 mt-4">
                  <button
                    onClick={() => setShowNotesPopup(false)}
                    className={`flex-1 py-2.5 rounded-xl font-medium transition-colors ${
                      isDark 
                      ? 'bg-slate-800 border border-slate-700 text-white hover:bg-slate-700' 
                      : 'bg-slate-100 border border-slate-200 text-slate-700 hover:bg-slate-200'
                    }`}
                  >
                    Cancel
                  </button>
                  <button
                    onClick={saveNotes}
                    className="flex-1 py-2.5 rounded-xl font-bold text-white bg-indigo-600 hover:bg-indigo-500 transition-colors"
                  >
                    Save
                  </button>
                </div>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
};