import React, { useState, useEffect } from 'react';
import { Theme } from '../types';

interface SpeedometerProps {
  theme: Theme;
}

export const Speedometer: React.FC<SpeedometerProps> = ({ theme }) => {
  const isDark = theme === 'dark';
  const [speed, setSpeed] = useState(45);

  // Simulate speed fluctuation
  useEffect(() => {
    const interval = setInterval(() => {
      setSpeed(prev => {
        const change = Math.floor(Math.random() * 5) - 2; // -2 to +2
        return Math.min(Math.max(prev + change, 0), 85);
      });
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className={`w-12 h-12 rounded-full border-[3px] flex flex-col items-center justify-center backdrop-blur-md shadow-lg transition-all ${
        isDark 
        ? 'bg-slate-900/80 border-indigo-500 text-white shadow-indigo-500/20' 
        : 'bg-white/90 border-indigo-600 text-indigo-900 shadow-indigo-500/20'
    }`}>
      <span className="text-xl font-black leading-none tracking-tighter">{speed}</span>
      <span className="text-[7px] font-bold uppercase opacity-70">MPH</span>
    </div>
  );
};