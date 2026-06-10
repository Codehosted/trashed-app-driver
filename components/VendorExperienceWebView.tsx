import React, { useMemo, useState } from 'react';
import { ArrowLeft, ExternalLink, LayoutDashboard, Package, Route, Settings, Truck, Users } from 'lucide-react';
import { buildVendorWebUrl, VendorWebTarget } from '../services/appConfig';
import { Theme } from '../types';

interface VendorExperienceWebViewProps {
  initialTarget?: VendorWebTarget;
  theme: Theme;
  onBackToDriverMap: () => void;
}

const TARGETS: Array<{ id: VendorWebTarget; label: string; icon: React.ComponentType<{ size?: number }> }> = [
  { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { id: 'dispatch', label: 'Dispatch', icon: Route },
  { id: 'rentals', label: 'Rentals', icon: Truck },
  { id: 'inventory', label: 'Inventory', icon: Package },
  { id: 'customers', label: 'Customers', icon: Users },
  { id: 'settings', label: 'Settings', icon: Settings },
];

export function VendorExperienceWebView({ initialTarget = 'dashboard', theme, onBackToDriverMap }: VendorExperienceWebViewProps) {
  const [target, setTarget] = useState<VendorWebTarget>(initialTarget);
  const url = useMemo(() => buildVendorWebUrl(target), [target]);
  const current = TARGETS.find((item) => item.id === target) || TARGETS[0];

  return (
    <div className={`h-screen w-full flex flex-col ${theme === 'dark' ? 'bg-slate-950 text-white' : 'bg-slate-50 text-slate-950'}`}>
      <header className={`flex items-center gap-2 border-b px-3 py-2 ${theme === 'dark' ? 'border-slate-800 bg-slate-950' : 'border-slate-200 bg-white'}`}>
        <button
          type="button"
          onClick={onBackToDriverMap}
          className={`h-9 w-9 rounded-full flex items-center justify-center ${theme === 'dark' ? 'bg-slate-800 text-white' : 'bg-slate-100 text-slate-900'}`}
          aria-label="Back to driver map"
        >
          <ArrowLeft size={18} />
        </button>
        <div className="min-w-0 flex-1">
          <p className="text-[10px] uppercase tracking-[0.18em] text-indigo-400 font-black">Trashed Vendor</p>
          <h1 className="text-sm font-black truncate">{current.label}</h1>
        </div>
        <a
          href={url}
          target="_blank"
          rel="noreferrer"
          className={`h-9 w-9 rounded-full flex items-center justify-center ${theme === 'dark' ? 'bg-slate-800 text-white' : 'bg-slate-100 text-slate-900'}`}
          aria-label="Open in browser"
        >
          <ExternalLink size={16} />
        </a>
      </header>

      <nav className={`flex gap-2 overflow-x-auto border-b px-3 py-2 ${theme === 'dark' ? 'border-slate-800 bg-slate-900' : 'border-slate-200 bg-white'}`}>
        {TARGETS.map(({ id, label, icon: Icon }) => {
          const active = id === target;
          return (
            <button
              key={id}
              type="button"
              onClick={() => setTarget(id)}
              className={`flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-bold transition ${
                active
                  ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-600/20'
                  : theme === 'dark'
                    ? 'bg-slate-800 text-slate-300'
                    : 'bg-slate-100 text-slate-700'
              }`}
            >
              <Icon size={14} />
              {label}
            </button>
          );
        })}
      </nav>

      <div className="relative flex-1 overflow-hidden">
        <iframe
          title={`Trashed vendor ${current.label}`}
          src={url}
          className="h-full w-full border-0 bg-white"
          allow="geolocation; camera; clipboard-read; clipboard-write"
        />
      </div>
    </div>
  );
}
