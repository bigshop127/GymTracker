import React, { useEffect, useRef, useState } from 'react';
import { NavLink } from 'react-router-dom';

interface NavItemProps {
  to: string;
  label: string;
  icon: React.ReactNode;
}

function NavItem({ to, label, icon }: NavItemProps) {
  return (
    <NavLink
      to={to}
      className={({ isActive }) =>
        `flex flex-col items-center justify-center py-2 text-xs font-medium transition-colors duration-200 shrink-0 min-w-[56px] ${
          isActive
            ? 'text-indigo-600 dark:text-indigo-400'
            : 'text-slate-400 hover:text-slate-600 dark:text-slate-500 dark:hover:text-slate-300'
        }`
      }
    >
      <div className="w-6 h-6 mb-1">{icon}</div>
      <span>{label}</span>
    </NavLink>
  );
}

export default function BottomNav() {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);

  // 9 個項目在窄版版面會塞不下、被裁掉一部分（例如「設定」滑到畫面外）；
  // 桌機滑鼠沒有觸控滑動可用，這裡用箭頭按鈕給一個一定按得到的捲動方式。
  const updateScrollState = () => {
    const el = scrollRef.current;
    if (!el) return;
    setCanScrollLeft(el.scrollLeft > 4);
    setCanScrollRight(el.scrollLeft + el.clientWidth < el.scrollWidth - 4);
  };

  useEffect(() => {
    updateScrollState();
    const el = scrollRef.current;
    if (!el) return;
    el.addEventListener('scroll', updateScrollState);
    window.addEventListener('resize', updateScrollState);
    return () => {
      el.removeEventListener('scroll', updateScrollState);
      window.removeEventListener('resize', updateScrollState);
    };
  }, []);

  const scrollByAmount = (dx: number) => {
    scrollRef.current?.scrollBy({ left: dx, behavior: 'smooth' });
  };

  // 滑鼠垂直滾輪在桌機是另一種直覺操作方式，這裡把垂直滾動量轉成橫向捲動。
  const handleWheel = (e: React.WheelEvent<HTMLDivElement>) => {
    const el = scrollRef.current;
    if (!el || el.scrollWidth <= el.clientWidth) return;
    if (Math.abs(e.deltaY) <= Math.abs(e.deltaX)) return; // 已經是橫向滾動（觸控板）就交給瀏覽器原生處理
    e.preventDefault();
    el.scrollLeft += e.deltaY;
  };

  return (
    <nav className="fixed bottom-0 left-1/2 -translate-x-1/2 w-full max-w-md bg-white dark:bg-slate-900 border-t border-slate-200 dark:border-slate-800 shadow-[0_-2px_10px_rgba(0,0,0,0.03)] z-50">
      <div className="relative px-2">
        {canScrollLeft && (
          <button
            type="button"
            onClick={() => scrollByAmount(-140)}
            aria-label="向左捲動選單"
            className="absolute left-0 top-0 h-16 w-7 flex items-center justify-center bg-gradient-to-r from-white dark:from-slate-900 via-white/90 dark:via-slate-900/90 to-transparent text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 z-10"
          >
            <svg fill="none" viewBox="0 0 24 24" strokeWidth="2.5" stroke="currentColor" className="w-4 h-4">
              <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5 8.25 12l7.5-7.5" />
            </svg>
          </button>
        )}
        {canScrollRight && (
          <button
            type="button"
            onClick={() => scrollByAmount(140)}
            aria-label="向右捲動選單"
            className="absolute right-0 top-0 h-16 w-7 flex items-center justify-center bg-gradient-to-l from-white dark:from-slate-900 via-white/90 dark:via-slate-900/90 to-transparent text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 z-10"
          >
            <svg fill="none" viewBox="0 0 24 24" strokeWidth="2.5" stroke="currentColor" className="w-4 h-4">
              <path strokeLinecap="round" strokeLinejoin="round" d="m8.25 4.5 7.5 7.5-7.5 7.5" />
            </svg>
          </button>
        )}
        <div ref={scrollRef} onWheel={handleWheel} className="flex overflow-x-auto scrollbar-none items-center h-16 gap-1">
          <NavItem
            to="/"
            label="訓練"
            icon={
              <svg fill="none" viewBox="0 0 24 24" strokeWidth="2.5" stroke="currentColor" className="w-full h-full">
                <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 9h16.5m-16.5 6.75h16.5" />
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 3.75a3 3 0 0 0-3 3v10.5a3 3 0 0 0 3 3h12a3 3 0 0 0 3-3V6.75a3 3 0 0 0-3-3H6Z" />
              </svg>
            }
          />
          <NavItem
            to="/plan"
            label="課表"
            icon={
              <svg fill="none" viewBox="0 0 24 24" strokeWidth="2" stroke="currentColor" className="w-full h-full">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 7.5h8.25m-8.25 4.5h8.25m-8.25 4.5h8.25M3.75 7.5h.008v.008H3.75V7.5Zm.375 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0ZM3.75 12h.008v.008H3.75V12Zm.375 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Zm-.375 4.5h.008v.008H3.75v-.008Zm.375 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Z" />
              </svg>
            }
          />
          <NavItem
            to="/schedule"
            label="班表"
            icon={
              <svg fill="none" viewBox="0 0 24 24" strokeWidth="2" stroke="currentColor" className="w-full h-full">
                <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 0 1 2.25-2.25h13.5A2.25 2.25 0 0 1 21 7.5v11.25m-18 0A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75m-18 0v-7.5A2.25 2.25 0 0 1 5.25 9h13.5A2.25 2.25 0 0 1 21 11.25v7.5m-9-6h.008v.008H12v-.008ZM12 15h.008v.008H12V15Zm0 2.25h.008v.008H12v-.008ZM9.75 15h.008v.008H9.75V15Zm0 2.25h.008v.008H9.75v-.008ZM7.5 15h.008v.008H7.5V15Zm0 2.25h.008v.008H7.5v-.008Zm6.75-4.5h.008v.008h-.008v-.008Zm0 2.25h.008v.008h-.008V15Zm0 2.25h.008v.008h-.008v-.008Zm2.25-4.5h.008v.008H16.5v-.008Zm0 2.25h.008v.008H16.5V15Z" />
              </svg>
            }
          />
          <NavItem
            to="/history"
            label="歷史"
            icon={
              <svg fill="none" viewBox="0 0 24 24" strokeWidth="2" stroke="currentColor" className="w-full h-full">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
              </svg>
            }
          />
          <NavItem
            to="/exercises"
            label="動作庫"
            icon={
              <svg fill="none" viewBox="0 0 24 24" strokeWidth="2" stroke="currentColor" className="w-full h-full">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 6.042A8.967 8.967 0 0 0 6 3.75c-1.052 0-2.062.18-3 .512v14.25A8.987 8.987 0 0 1 6 18c2.305 0 4.408.867 6 2.292m0-14.25a8.966 8.966 0 0 1 6-2.292c1.052 0 2.062.18 3 .512v14.25A8.987 8.987 0 0 0 18 18a8.967 8.967 0 0 0-6 2.292m0-14.25v14.25" />
              </svg>
            }
          />
          <NavItem
            to="/progress"
            label="進度"
            icon={
              <svg fill="none" viewBox="0 0 24 24" strokeWidth="2" stroke="currentColor" className="w-full h-full">
                <path strokeLinecap="round" strokeLinejoin="round" d="M7.5 14.25v2.25m3-4.5v4.5m3-6.75v6.75m3-9v9M6 20.25h12A2.25 2.25 0 0 0 20.25 18V6A2.25 2.25 0 0 0 18 3.75H6A2.25 2.25 0 0 0 3.75 6v12A2.25 2.25 0 0 0 6 20.25Z" />
              </svg>
            }
          />
          <NavItem
            to="/tracker"
            label="追蹤"
            icon={
              <svg fill="none" viewBox="0 0 24 24" strokeWidth="2" stroke="currentColor" className="w-full h-full">
                <path strokeLinecap="round" strokeLinejoin="round" d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 0 1 3 19.875v-6.75ZM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 0 1-1.125-1.125V8.625ZM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 0 1-1.125-1.125V4.125Z" />
              </svg>
            }
          />
          <NavItem
            to="/calculator"
            label="1RM"
            icon={
              <svg fill="none" viewBox="0 0 24 24" strokeWidth="2" stroke="currentColor" className="w-full h-full">
                <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 7.5h.008v.008H6.75V7.5Zm3 0h.008v.008H9.75V7.5Zm3 0h.008v.008H12.75V7.5Zm3 0h.008v.008H15.75V7.5ZM6.75 11.25h.008v.008H6.75v-.008Zm3 0h.008v.008H9.75v-.008Zm3 0h.008v.008H12.75v-.008Zm3 0h.008v.008H15.75v-.008ZM6.75 15h.008v.008H6.75V15Zm3 0h.008v.008H9.75V15Zm3 0h.008v.008H12.75V15Zm3 0h.008v.008H15.75V15ZM4.5 19.5h15a2.25 2.25 0 0 0 2.25-2.25V6.75A2.25 2.25 0 0 0 19.5 4.5h-15a2.25 2.25 0 0 0-2.25 2.25v10.5A2.25 2.25 0 0 0 4.5 19.5Z" />
              </svg>
            }
          />
          <NavItem
            to="/settings"
            label="設定"
            icon={
              <svg fill="none" viewBox="0 0 24 24" strokeWidth="2" stroke="currentColor" className="w-full h-full">
                <path strokeLinecap="round" strokeLinejoin="round" d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.324.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 0 1 1.37.49l1.296 2.247a1.125 1.125 0 0 1-.26 1.43l-1.003.828c-.293.241-.438.613-.43.992a7.723 7.723 0 0 1 0 .255c-.008.378.137.75.43.991l1.004.827c.424.35.534.954.26 1.43l-1.298 2.247a1.125 1.125 0 0 1-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.47 6.47 0 0 1-.22.128c-.331.183-.581.495-.644.869l-.213 1.281c-.09.543-.56.94-1.11.94h-2.594c-.55 0-1.019-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 0 1-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 0 1-1.369-.49l-1.297-2.247a1.125 1.125 0 0 1 .26-1.43l1.004-.827c.292-.24.437-.613.43-.991a6.932 6.932 0 0 1 0-.255c.007-.38-.138-.751-.43-.992l-1.004-.827a1.125 1.125 0 0 1-.26-1.43l1.297-2.247a1.125 1.125 0 0 1 1.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.086.22-.128.332-.183.582-.495.644-.869l.214-1.28Z" />
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" />
              </svg>
            }
          />
        </div>
      </div>
    </nav>
  );
}
