import React, { useEffect } from 'react';
import BottomNav from './BottomNav';
import RestTimer from './RestTimer';
import { useSettingsStore } from '../store/settings';

interface LayoutProps {
  children: React.ReactNode;
}

export default function Layout({ children }: LayoutProps) {
  const { settings } = useSettingsStore();
  const theme = settings?.theme || 'system';

  useEffect(() => {
    const root = window.document.documentElement;

    const applyTheme = () => {
      let isDark = false;
      if (theme === 'dark') {
        isDark = true;
      } else if (theme === 'system') {
        isDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
      }

      if (isDark) {
        root.classList.add('dark');
      } else {
        root.classList.remove('dark');
      }
    };

    applyTheme();

    if (theme === 'system') {
      const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
      const listener = () => applyTheme();
      mediaQuery.addEventListener('change', listener);
      return () => mediaQuery.removeEventListener('change', listener);
    }
  }, [theme]);

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 flex justify-center text-slate-800 dark:text-slate-100 transition-colors duration-200">
      <div className="w-full max-w-md bg-white dark:bg-slate-900 flex flex-col min-h-screen pb-16 relative shadow-md border-x border-slate-100 dark:border-slate-800 transition-colors duration-200">
        {/* Header Bar */}
        <header className="sticky top-0 bg-white/80 dark:bg-slate-900/80 backdrop-blur-md border-b border-slate-100 dark:border-slate-800 h-14 flex items-center px-4 z-40 transition-colors duration-200">
          <div className="flex items-center gap-2">
            <span className="text-xl font-bold bg-gradient-to-r from-indigo-600 to-violet-600 dark:from-indigo-400 dark:to-violet-400 bg-clip-text text-transparent">
              GymTracker
            </span>
            <span className="text-[10px] font-semibold bg-indigo-50 dark:bg-indigo-950/50 text-indigo-700 dark:text-indigo-400 px-1.5 py-0.5 rounded-full border border-indigo-100 dark:border-indigo-900/40">
              MVP
            </span>
          </div>
        </header>

        {/* Content Area */}
        <main className="flex-1 overflow-y-auto bg-slate-50/50 dark:bg-slate-950/20">
          {children}
        </main>

        {/* 休息計時器 */}
        <RestTimer />

        {/* Navigation Bar */}
        <BottomNav />
      </div>
    </div>
  );
}
