import React, { useEffect, useMemo, useState } from 'react';
import { Capacitor } from '@capacitor/core';
import { ArrowLeft, ExternalLink, LayoutDashboard, Package, Route, Settings, Sparkles, Truck, Users } from 'lucide-react';
import { buildVendorWebUrl, getTrashedWebBaseUrl, VendorWebTarget } from '../services/appConfig';
import { Theme } from '../types';

interface VendorExperienceWebViewProps {
  initialTarget?: VendorWebTarget;
  theme: Theme;
  onBackToDriverMap: () => void;
}

const TARGETS: Array<{ id: VendorWebTarget; label: string; icon: React.ComponentType<{ size?: number }> }> = [
  { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { id: 'dispatch', label: 'Dispatch', icon: Route },
  { id: 'assistant', label: 'Assistant', icon: Sparkles },
  { id: 'rentals', label: 'Rentals', icon: Truck },
  { id: 'inventory', label: 'Inventory', icon: Package },
  { id: 'customers', label: 'Customers', icon: Users },
  { id: 'settings', label: 'Settings', icon: Settings },
];

export function VendorExperienceWebView({ initialTarget = 'dashboard', theme, onBackToDriverMap }: VendorExperienceWebViewProps) {
  const [target, setTarget] = useState<VendorWebTarget>(initialTarget);
  const [authReady, setAuthReady] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const url = useMemo(() => buildVendorWebUrl(target), [target]);
  const current = TARGETS.find((item) => item.id === target) || TARGETS[0];
  const CurrentIcon = current.icon;
  const shouldUseTopLevelVendorWebView = Capacitor.getPlatform() !== 'web';

  useEffect(() => {
    const email = import.meta.env.VITE_LOCAL_E2E_VENDOR_EMAIL as string | undefined;
    const password = import.meta.env.VITE_LOCAL_E2E_VENDOR_PASSWORD as string | undefined;

    if (!email || !password) {
      setAuthReady(true);
      return;
    }

    let cancelled = false;
    fetch(`${getTrashedWebBaseUrl()}/api/auth/mobile/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ email, password }),
    })
      .then(async (response) => {
        if (!response.ok) {
          const body = await response.json().catch(() => null);
          throw new Error(body?.error || `Login failed with HTTP ${response.status}`);
        }
      })
      .then(() => {
        if (!cancelled) setAuthReady(true);
      })
      .catch((error) => {
        if (!cancelled) {
          setAuthError(error instanceof Error ? error.message : 'Local test login failed');
          setAuthReady(true);
        }
      });

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!authReady || authError || !shouldUseTopLevelVendorWebView) return;

    // Native WebViews should not nest the vendor dashboard in an iframe: iOS
    // safe areas/status bars and cross-origin iframe painting make the wrapper
    // look broken. Use the app WebView itself as the vendor WebView.
    window.location.assign(url);
  }, [authReady, authError, shouldUseTopLevelVendorWebView, url]);

  if (authReady && shouldUseTopLevelVendorWebView && !authError) {
    return (
      <div className="flex h-screen w-full flex-col bg-slate-950 text-white">
        <div className="flex flex-1 flex-col items-center justify-center px-8 text-center">
          <div className="mb-5 flex h-14 w-14 items-center justify-center rounded-2xl bg-indigo-500/15 text-indigo-200 ring-1 ring-indigo-300/20">
            <CurrentIcon size={26} />
          </div>
          <p className="text-[11px] font-black uppercase tracking-[0.28em] text-indigo-300/80">Trashed Vendor</p>
          <h1 className="mt-2 text-2xl font-black tracking-tight">Opening {current.label}</h1>
          <p className="mt-3 max-w-xs text-sm font-medium leading-6 text-slate-400">
            Loading the real vendor dashboard directly in the app WebView…
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className={`h-screen w-full flex flex-col ${theme === 'dark' ? 'bg-slate-950 text-white' : 'bg-slate-50 text-slate-950'}`}>
      <header className={`flex items-center gap-3 border-b px-4 pb-3 pt-[max(env(safe-area-inset-top),0.75rem)] ${theme === 'dark' ? 'border-slate-800/80 bg-slate-950/95' : 'border-slate-200 bg-white'}`}>
        <button
          type="button"
          onClick={onBackToDriverMap}
          className={`h-11 w-11 shrink-0 rounded-full flex items-center justify-center shadow-sm ring-1 ring-inset ${theme === 'dark' ? 'bg-slate-900 text-white ring-white/10' : 'bg-slate-100 text-slate-900 ring-slate-200'}`}
          aria-label="Back to driver map"
        >
          <ArrowLeft size={20} />
        </button>
        <div className="min-w-0 flex-1">
          <p className="text-[10px] uppercase tracking-[0.2em] text-indigo-400 font-black">Trashed Vendor</p>
          <h1 className="text-lg font-black leading-tight tracking-tight truncate">{current.label}</h1>
        </div>
        <a
          href={url}
          target="_blank"
          rel="noreferrer"
          className={`h-11 w-11 shrink-0 rounded-full flex items-center justify-center shadow-sm ring-1 ring-inset ${theme === 'dark' ? 'bg-slate-900 text-white ring-white/10' : 'bg-slate-100 text-slate-900 ring-slate-200'}`}
          aria-label="Open in browser"
        >
          <ExternalLink size={18} />
        </a>
      </header>

      <nav className={`flex gap-2 overflow-x-auto border-b px-4 py-3 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden ${theme === 'dark' ? 'border-slate-800/80 bg-slate-950/90' : 'border-slate-200 bg-white'}`}>
        {TARGETS.map(({ id, label, icon: Icon }) => {
          const active = id === target;
          return (
            <button
              key={id}
              type="button"
              onClick={() => setTarget(id)}
              className={`flex shrink-0 items-center gap-1.5 rounded-full px-3.5 py-2 text-xs font-bold transition ${
                active
                  ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-600/25'
                  : theme === 'dark'
                    ? 'bg-slate-900 text-slate-300 ring-1 ring-inset ring-white/10'
                    : 'bg-slate-100 text-slate-700 ring-1 ring-inset ring-slate-200'
              }`}
            >
              <Icon size={14} />
              {label}
            </button>
          );
        })}
      </nav>

      <div className="relative flex-1 overflow-hidden">
        {authError && (
          <div className="absolute inset-x-3 top-3 z-10 rounded-xl border border-red-500/40 bg-red-950/90 p-3 text-xs font-bold text-red-100 shadow-lg">
            Local mobile login failed: {authError}
          </div>
        )}
        {authReady ? (
          <iframe
            title={`Trashed vendor ${current.label}`}
            src={url}
            className="h-full w-full border-0 bg-white"
            allow="geolocation; camera; clipboard-read; clipboard-write"
          />
        ) : (
          <div className="flex h-full items-center justify-center bg-slate-950 text-sm font-bold text-slate-300">
            Signing into local vendor account…
          </div>
        )}
      </div>
    </div>
  );
}
