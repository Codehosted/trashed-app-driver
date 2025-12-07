import React, { useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Bell, X } from 'lucide-react';

interface NotificationToastProps {
  notification: { title: string; body: string } | null;
  onClose: () => void;
}

export const NotificationToast: React.FC<NotificationToastProps> = ({ notification, onClose }) => {
  // Auto-dismiss after 5 seconds
  useEffect(() => {
    if (notification) {
      const timer = setTimeout(onClose, 5000);
      return () => clearTimeout(timer);
    }
  }, [notification, onClose]);

  return (
    <AnimatePresence>
      {notification && (
        <motion.div
          initial={{ opacity: 0, y: -50, scale: 0.9 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: -20, scale: 0.9 }}
          className="fixed top-6 left-0 right-0 mx-auto w-11/12 max-w-sm z-[100] cursor-pointer"
          onClick={onClose}
        >
          <div className="bg-slate-900/90 backdrop-blur-md border border-slate-700 p-4 rounded-2xl shadow-2xl flex items-start gap-4">
            <div className="bg-indigo-600 p-2 rounded-xl shrink-0">
              <Bell className="text-white" size={20} />
            </div>
            <div className="flex-1">
              <h4 className="font-bold text-white text-sm">{notification.title}</h4>
              <p className="text-slate-300 text-xs leading-relaxed mt-1">{notification.body}</p>
            </div>
            <button 
                onClick={(e) => { e.stopPropagation(); onClose(); }} 
                className="text-slate-500 hover:text-white transition-colors"
            >
                <X size={16} />
            </button>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};
