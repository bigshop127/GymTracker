import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import BottomNav from './BottomNav';
import HistoryNavButtons from './HistoryNavButtons';
import RestTimer from './RestTimer';
import { useSettingsStore } from '../store/settings';
import { useSyncStore } from '../store/sync';
import { APP_VERSION } from '../version';

interface LayoutProps {
  children: React.ReactNode;
}

export default function Layout({ children }: LayoutProps) {
  const navigate = useNavigate();
  const { settings } = useSettingsStore();
  const theme = settings?.theme || 'system';
  const { user, syncStatus, lastUploadAt, lastDownloadAt, errorMessage, isFirebaseConfigured, upload, download } = useSyncStore();
  const [feedback, setFeedback] = useState<'上傳完成' | '下載完成' | null>(null);

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

  const handleUploadClick = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!user) {
      navigate('/settings');
      return;
    }
    await upload();
    if (useSyncStore.getState().syncStatus === 'idle') {
      setFeedback('上傳完成');
      setTimeout(() => setFeedback(null), 2000);
    }
  };

  const handleDownloadClick = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!user) {
      navigate('/settings');
      return;
    }
    await download();
    if (useSyncStore.getState().syncStatus === 'idle') {
      setFeedback('下載完成');
      setTimeout(() => setFeedback(null), 2000);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 flex justify-center text-slate-800 dark:text-slate-100 transition-colors duration-200">
      <div className="w-full max-w-md bg-white dark:bg-slate-900 flex flex-col min-h-screen pb-16 relative shadow-md border-x border-slate-100 dark:border-slate-800 transition-colors duration-200">
        {/* Header Bar */}
        <header className="sticky top-0 bg-white/80 dark:bg-slate-900/80 backdrop-blur-md border-b border-slate-100 dark:border-slate-800 h-14 flex items-center justify-between px-4 z-40 transition-colors duration-200">
          <div className="flex items-center gap-2">
            <HistoryNavButtons />
            <span className="text-xl font-bold bg-gradient-to-r from-indigo-600 to-violet-600 dark:from-indigo-400 dark:to-violet-400 bg-clip-text text-transparent">
              GymTracker
            </span>
            <span className="text-[10px] font-semibold bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 px-1.5 py-0.5 rounded-full border border-slate-200 dark:border-slate-700">
              v{APP_VERSION}
            </span>
            <span className="text-[10px] font-semibold bg-indigo-50 dark:bg-indigo-950/50 text-indigo-700 dark:text-indigo-400 px-1.5 py-0.5 rounded-full border border-indigo-100 dark:border-indigo-900/40">
              MVP
            </span>
          </div>

          {/* Upload / Download Buttons */}
          {isFirebaseConfigured && (
            <div className="flex items-center gap-2">
              {feedback && (
                <span className="text-xs font-semibold text-emerald-600 dark:text-emerald-400 transition-all duration-200">
                  {feedback}
                </span>
              )}
              <button
                onClick={handleDownloadClick}
                disabled={syncStatus === 'syncing'}
                className="relative p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200 transition-colors duration-200"
                title={
                  !user
                    ? '登入以啟用雲端同步'
                    : syncStatus === 'error'
                    ? `同步出錯: ${errorMessage}`
                    : lastDownloadAt
                    ? `上次下載時間：${new Date(lastDownloadAt).toLocaleTimeString()}`
                    : '尚未下載過，點擊從雲端下載'
                }
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  fill="none"
                  viewBox="0 0 24 24"
                  strokeWidth="2"
                  stroke="currentColor"
                  className={`w-5 h-5 ${syncStatus === 'syncing' ? 'animate-pulse' : ''}`}
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M12 9.75v6.75m0 0-3.75-3.75M12 16.5l3.75-3.75M3 15a4.5 4.5 0 0 0 4.5 4.5H18a3.75 3.75 0 0 0 1.332-7.257 3 3 0 0 0-3.758-3.848 5.25 5.25 0 0 0-10.233 2.33A4.502 4.502 0 0 0 3 15Z"
                  />
                </svg>

                {/* Status Dot */}
                {user && (
                  <span className="absolute top-1 right-1 flex h-2 w-2">
                    {syncStatus === 'syncing' && (
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75"></span>
                    )}
                    <span
                      className={`relative inline-flex rounded-full h-2 w-2 ${
                        syncStatus === 'syncing'
                          ? 'bg-amber-500'
                          : syncStatus === 'error'
                          ? 'bg-rose-500'
                          : lastDownloadAt
                          ? 'bg-emerald-500'
                          : 'bg-slate-400'
                      }`}
                    ></span>
                  </span>
                )}
              </button>
              <button
                onClick={handleUploadClick}
                disabled={syncStatus === 'syncing'}
                className="relative p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200 transition-colors duration-200"
                title={
                  !user
                    ? '登入以啟用雲端同步'
                    : syncStatus === 'error'
                    ? `同步出錯: ${errorMessage}`
                    : lastUploadAt
                    ? `上次上傳時間：${new Date(lastUploadAt).toLocaleTimeString()}`
                    : '尚未上傳過，點擊上傳到雲端'
                }
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  fill="none"
                  viewBox="0 0 24 24"
                  strokeWidth="2"
                  stroke="currentColor"
                  className={`w-5 h-5 ${syncStatus === 'syncing' ? 'animate-pulse' : ''}`}
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M12 16.5V9.75m0 0-3.75 3.75M12 9.75l3.75 3.75M3 15a4.5 4.5 0 0 0 4.5 4.5H18a3.75 3.75 0 0 0 1.332-7.257 3 3 0 0 0-3.758-3.848 5.25 5.25 0 0 0-10.233 2.33A4.502 4.502 0 0 0 3 15Z"
                  />
                </svg>

                {/* Status Dot */}
                {user && (
                  <span className="absolute top-1 right-1 flex h-2 w-2">
                    {syncStatus === 'syncing' && (
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75"></span>
                    )}
                    <span
                      className={`relative inline-flex rounded-full h-2 w-2 ${
                        syncStatus === 'syncing'
                          ? 'bg-amber-500'
                          : syncStatus === 'error'
                          ? 'bg-rose-500'
                          : lastUploadAt
                          ? 'bg-emerald-500'
                          : 'bg-slate-400'
                      }`}
                    ></span>
                  </span>
                )}
              </button>
            </div>
          )}
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
