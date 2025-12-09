import React from 'react';
import { CloudSun, Wind, Droplets } from 'lucide-react';
import { Theme } from '../web/types';

interface WeatherWidgetProps {
  theme: Theme;
}

export const WeatherWidget: React.FC<WeatherWidgetProps> = ({ theme }) => {
  const isDark = theme === 'dark';

  return (
    <div className={`flex items-center gap-2 px-3 py-1.5 rounded-full backdrop-blur-md border shadow-lg ${
      isDark ? 'bg-slate-800/80 border-slate-700 text-white' : 'bg-white/80 border-slate-200 text-slate-800'
    }`}>
      <div className="flex flex-col items-end">
        <span className="text-[9px] opacity-70 font-medium uppercase tracking-wider">Detroit, MI</span>
        <span className="text-base font-bold leading-none">72°</span>
      </div>
      <div className="h-6 w-px bg-current opacity-20"></div>
      <CloudSun size={18} className="text-amber-500" />
      <div className="hidden sm:flex flex-col gap-0.5 text-[9px] opacity-70">
         <div className="flex items-center gap-1"><Wind size={9} /> 8 mph</div>
         <div className="flex items-center gap-1"><Droplets size={9} /> 12%</div>
      </div>
    </div>
  );
};