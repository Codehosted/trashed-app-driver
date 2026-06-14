import React from 'react';
import { Truck } from 'lucide-react';

export const Login = () => {
  return (
    <div className="min-h-screen bg-slate-900 flex flex-col items-center justify-center p-6 relative overflow-hidden">
      <div className="absolute top-0 left-0 w-full h-full bg-[radial-gradient(circle_at_50%_120%,rgba(120,0,255,0.1),rgba(0,0,0,0))]" />

      <div className="z-10 w-full max-w-md bg-slate-800/50 backdrop-blur-xl border border-slate-700 p-8 rounded-3xl shadow-2xl">
        <div className="flex flex-col items-center mb-8">
          <div className="w-16 h-16 bg-indigo-600 rounded-2xl flex items-center justify-center shadow-lg shadow-indigo-500/20 mb-4 transform rotate-3">
            <Truck className="text-white" size={32} />
          </div>
          <h1 className="text-3xl font-black text-white tracking-tight text-center">TRASHED</h1>
          <p className="text-slate-400 font-medium tracking-wide text-sm uppercase">App for Drivers</p>
        </div>

        <div className="rounded-xl border border-slate-700 bg-slate-900/70 p-4 text-sm text-slate-300">
          Driver auth is handled by the Trashed API/WebView flow. Firebase auth is intentionally not used in this mobile shell.
        </div>
      </div>
    </div>
  );
};
