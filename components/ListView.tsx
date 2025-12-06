import React from 'react';
import { motion } from 'framer-motion';
import { RouteStop, Theme } from '../types';
import { Icon } from './Icons';

interface ListViewProps {
  stops: RouteStop[];
  activeIndex: number;
  onSelect: (index: number) => void;
  onClose: () => void;
  theme: Theme;
}

export const ListView: React.FC<ListViewProps> = ({ stops, activeIndex, onSelect, onClose, theme }) => {
  const isDark = theme === 'dark';

  return (
    <motion.div 
        initial={{ x: '100%', opacity: 0 }}
        animate={{ x: 0, opacity: 1 }}
        exit={{ x: '100%', opacity: 0 }}
        className={`absolute top-0 right-0 h-full w-full md:w-96 shadow-2xl z-50 flex flex-col border-l backdrop-blur-xl ${
            isDark 
            ? 'bg-slate-900/95 border-slate-800' 
            : 'bg-white/95 border-gray-100'
        }`}
    >
      <div className={`p-6 border-b flex justify-between items-center ${isDark ? 'border-slate-800 bg-slate-900/50' : 'border-gray-100 bg-gray-50/50'}`}>
        <h2 className={`text-xl font-bold ${isDark ? 'text-white' : 'text-gray-800'}`}>Today's Route</h2>
        <button onClick={onClose} className={`p-2 rounded-full transition-colors ${isDark ? 'hover:bg-slate-800 text-slate-400' : 'hover:bg-gray-200 text-gray-500'}`}>
            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>
        </button>
      </div>
      
      <div className="flex-1 overflow-y-auto custom-scrollbar p-4 space-y-3">
        {stops.map((stop, i) => (
            <div 
                key={stop.id}
                onClick={() => onSelect(i)}
                className={`p-4 rounded-xl border-2 transition-all cursor-pointer flex items-start gap-4 ${
                    i === activeIndex 
                    ? isDark ? 'border-indigo-500 bg-indigo-900/20 shadow-md' : 'border-blue-500 bg-blue-50/50 shadow-md'
                    : isDark ? 'border-slate-800 bg-slate-900/50 hover:bg-slate-800' : 'border-transparent hover:bg-gray-50 bg-white shadow-sm border-gray-100'
                }`}
            >
                <div 
                    className="w-10 h-10 rounded-full flex items-center justify-center shrink-0 text-white shadow-sm"
                    style={{ backgroundColor: stop.color }}
                >
                    <Icon type={stop.type} size={18} />
                </div>
                <div>
                    <div className="flex items-center gap-2 mb-1">
                        <span className="text-xs font-bold text-gray-400 uppercase tracking-wider">Stop {i + 1}</span>
                        {stop.time && <span className="text-xs text-gray-400">• {stop.time}</span>}
                    </div>
                    <h3 className={`font-bold leading-tight mb-1 ${isDark ? 'text-slate-100' : 'text-gray-800'}`}>{stop.title}</h3>
                    <p className={`text-sm leading-snug ${isDark ? 'text-slate-400' : 'text-gray-500'}`}>{stop.description}</p>
                </div>
            </div>
        ))}
      </div>
    </motion.div>
  );
};
