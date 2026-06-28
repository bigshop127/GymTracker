import React from 'react';
import BottomNav from './BottomNav';

interface LayoutProps {
  children: React.ReactNode;
}

export default function Layout({ children }: LayoutProps) {
  return (
    <div className="min-h-screen bg-slate-50 flex justify-center text-slate-800">
      <div className="w-full max-w-md bg-white flex flex-col min-h-screen pb-16 relative shadow-md border-x border-slate-100">
        {/* Header Bar */}
        <header className="sticky top-0 bg-white/80 backdrop-blur-md border-b border-slate-100 h-14 flex items-center px-4 z-40">
          <div className="flex items-center gap-2">
            <span className="text-xl font-bold bg-gradient-to-r from-indigo-600 to-violet-600 bg-clip-text text-transparent">
              GymTracker
            </span>
            <span className="text-[10px] font-semibold bg-indigo-50 text-indigo-700 px-1.5 py-0.5 rounded-full border border-indigo-100">
              MVP
            </span>
          </div>
        </header>

        {/* Content Area */}
        <main className="flex-1 overflow-y-auto bg-slate-50/50">
          {children}
        </main>

        {/* Navigation Bar */}
        <BottomNav />
      </div>
    </div>
  );
}
