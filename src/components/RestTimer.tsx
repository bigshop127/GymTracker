import { useEffect } from 'react';
import { useRestTimerStore } from '../store/restTimer';

export default function RestTimer() {
  const { isActive, remainingSeconds, duration, adjustTimer, skipTimer, tick } = useRestTimerStore();

  // 註冊時鐘 Tick (以鎖屏安全的時間戳為基準進行更新)
  useEffect(() => {
    if (!isActive) return;

    // 立即更新一次，隨後每秒 Tick
    tick();
    const interval = setInterval(() => {
      tick();
    }, 1000);

    return () => clearInterval(interval);
  }, [isActive, tick]);

  if (!isActive) return null;

  // 計算進度條比例
  const progress = duration > 0 ? (remainingSeconds / duration) * 100 : 0;

  // 格式化秒數為 mm:ss
  const formatTime = (secs: number) => {
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  return (
    <div className="absolute bottom-16 left-0 right-0 px-4 pb-2 z-40 animate-slide-up">
      <div className="bg-slate-900 text-white rounded-xl shadow-xl overflow-hidden border border-slate-800">
        {/* 進度條 */}
        <div className="w-full bg-slate-800 h-1">
          <div
            className="bg-indigo-500 h-full transition-all duration-1000 ease-linear"
            style={{ width: `${progress}%` }}
          />
        </div>

        {/* 內容區 */}
        <div className="px-4 py-3 flex items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <span className="text-xl animate-pulse">⏰</span>
            <div>
              <div className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">組間休息中</div>
              <div className="text-lg font-bold font-mono tracking-wide">
                {formatTime(remainingSeconds)}
              </div>
            </div>
          </div>

          {/* 控制按鈕 */}
          <div className="flex items-center gap-1.5 text-xs font-bold">
            <button
              onClick={() => adjustTimer(-15)}
              className="px-2.5 py-1.5 bg-slate-800 hover:bg-slate-700 active:bg-slate-650 rounded-lg transition"
            >
              -15s
            </button>
            <button
              onClick={() => adjustTimer(15)}
              className="px-2.5 py-1.5 bg-slate-800 hover:bg-slate-700 active:bg-slate-650 rounded-lg transition"
            >
              +15s
            </button>
            <button
              onClick={skipTimer}
              className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 active:bg-indigo-700 text-white rounded-lg transition shadow shadow-indigo-800"
            >
              跳過
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
