import { useEffect } from 'react';
import { useLocation, useNavigate, useNavigationType } from 'react-router-dom';
import { canGoBack, canGoForward, type NavigationKind } from '../lib/historyStack';
import { useHistoryNavStore } from '../store/historyNav';

const BUTTON_CLASS =
  'p-1.5 rounded-lg text-slate-500 dark:text-slate-400 transition-colors duration-200 ' +
  'enabled:hover:bg-slate-100 enabled:hover:text-slate-700 ' +
  'dark:enabled:hover:bg-slate-800 dark:enabled:hover:text-slate-200 ' +
  'disabled:opacity-25';

/** Header 上的「前一步 / 下一步」。放在 Layout 裡，所以每一頁都有。 */
export default function HistoryNavButtons() {
  const location = useLocation();
  const navigationType = useNavigationType();
  const navigate = useNavigate();
  const stack = useHistoryNavStore((s) => s.stack);
  const record = useHistoryNavStore((s) => s.record);

  useEffect(() => {
    record(location.key, String(navigationType) as NavigationKind);
  }, [location.key, navigationType, record]);

  const backEnabled = canGoBack(stack);
  const forwardEnabled = canGoForward(stack);

  return (
    <div className="flex items-center -ml-1.5">
      <button
        type="button"
        onClick={() => navigate(-1)}
        disabled={!backEnabled}
        aria-label="前一步"
        title="前一步"
        className={BUTTON_CLASS}
      >
        <svg fill="none" viewBox="0 0 24 24" strokeWidth="2.5" stroke="currentColor" className="w-5 h-5">
          <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5 8.25 12l7.5-7.5" />
        </svg>
      </button>
      <button
        type="button"
        onClick={() => navigate(1)}
        disabled={!forwardEnabled}
        aria-label="下一步"
        title="下一步"
        className={BUTTON_CLASS}
      >
        <svg fill="none" viewBox="0 0 24 24" strokeWidth="2.5" stroke="currentColor" className="w-5 h-5">
          <path strokeLinecap="round" strokeLinejoin="round" d="m8.25 4.5 7.5 7.5-7.5 7.5" />
        </svg>
      </button>
    </div>
  );
}
