import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { AppMessage, Theme } from '../types';
import { Bell, AlertTriangle, Info, X } from 'lucide-react';

interface MessageCarouselProps {
  messages: AppMessage[];
  theme: Theme;
}

export const MessageCarousel: React.FC<MessageCarouselProps> = ({ messages: initialMessages, theme }) => {
  const [messages, setMessages] = useState(initialMessages);
  const [currentIndex, setCurrentIndex] = useState(0);
  const isDark = theme === 'dark';

  if (messages.length === 0) return null;

  const currentMessage = messages[currentIndex];

  const handleDismiss = (e: React.MouseEvent) => {
    e.stopPropagation();
    const newMessages = messages.filter((_, i) => i !== currentIndex);
    setMessages(newMessages);
    if (currentIndex >= newMessages.length) {
      setCurrentIndex(Math.max(0, newMessages.length - 1));
    }
  };

  const handleNext = () => {
    setCurrentIndex((prev) => (prev + 1) % messages.length);
  };

  const getIcon = (type: string) => {
    switch (type) {
        case 'urgent': return <AlertTriangle size={16} className="text-red-500" />;
        case 'warning': return <Bell size={16} className="text-amber-500" />;
        default: return <Info size={16} className="text-blue-500" />;
    }
  };

  const getBorderColor = (type: string) => {
    switch (type) {
        case 'urgent': return 'border-l-red-500';
        case 'warning': return 'border-l-amber-500';
        default: return 'border-l-blue-500';
    }
  };

  return (
    <div className="absolute bottom-4 left-0 right-0 z-30 flex justify-center pointer-events-none">
      <AnimatePresence mode="wait">
        <motion.div
            key={currentMessage.id}
            initial={{ opacity: 0, y: 20, scale: 0.9 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -20, scale: 0.9 }}
            drag="x"
            dragConstraints={{ left: 0, right: 0 }}
            onDragEnd={(e, { offset, velocity }) => {
              const swipe = Math.abs(offset.x) * velocity.x;
              if (swipe < -100 || swipe > 100) {
                handleNext();
              }
            }}
            className={`pointer-events-auto w-full max-w-sm mx-4 p-3 rounded-xl shadow-xl backdrop-blur-md border-l-4 cursor-grab active:cursor-grabbing relative group ${
                getBorderColor(currentMessage.type)
            } ${
                isDark ? 'bg-slate-900/90 border-y border-r border-y-slate-700 border-r-slate-700 text-white' : 'bg-white/90 border-y border-r border-y-slate-200 border-r-slate-200 text-slate-800'
            }`}
        >
            <div className="flex items-start gap-3 mb-3">
                <div className={`p-2 rounded-full shrink-0 ${isDark ? 'bg-slate-800' : 'bg-slate-100'}`}>
                    {getIcon(currentMessage.type)}
                </div>
                <div className="flex-1 min-w-0">
                    <div className="flex justify-between items-center mb-1">
                        <h4 className="font-bold text-xs truncate">{currentMessage.title}</h4>
                        <span className="text-[9px] opacity-60 font-medium whitespace-nowrap">{currentMessage.time}</span>
                    </div>
                    <p className="text-[11px] opacity-80 leading-snug line-clamp-2">{currentMessage.content}</p>
                </div>
                <button 
                    onClick={handleDismiss}
                    className="p-1 rounded-full hover:bg-black/10 transition-colors opacity-0 group-hover:opacity-100"
                >
                    <X size={14} />
                </button>
            </div>
            
            {/* Pagination Dots */}
            {messages.length > 1 && (
                <div className="absolute bottom-2 left-0 right-0 flex justify-center gap-1">
                    {messages.map((_, i) => (
                        <div key={i} className={`w-1 h-1 rounded-full transition-colors ${i === currentIndex ? (isDark ? 'bg-white' : 'bg-slate-800') : (isDark ? 'bg-slate-700' : 'bg-slate-300')}`} />
                    ))}
                </div>
            )}
        </motion.div>
      </AnimatePresence>
    </div>
  );
};