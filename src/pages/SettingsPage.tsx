import React, { useRef } from 'react';
import { useSettingsStore } from '../store/settings';
import { useActiveWorkoutStore } from '../store/activeWorkout';
import { playRestEndSound } from '../store/restTimer';
import { exportBackupData, importBackupData } from '../lib/backup';
import NumberStepper from '../components/NumberStepper';

export default function SettingsPage() {
  const { settings, updateSettings, initSettings } = useSettingsStore();
  const { initActiveWorkout } = useActiveWorkoutStore();
  const fileInputRef = useRef<HTMLInputElement>(null);

  if (!settings) {
    return (
      <div className="p-12 text-center text-slate-400 font-semibold animate-pulse">
        正在載入設定...
      </div>
    );
  }

  const handleUpdate = async (updates: Parameters<typeof updateSettings>[0]) => {
    await updateSettings(updates);
  };

  const handleTestBeep = () => {
    playRestEndSound();
  };

  const handleExport = async () => {
    try {
      const dataStr = await exportBackupData();
      const blob = new Blob([dataStr], { type: 'application/json;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const filename = `gymtracker-backup-${new Date().toISOString().slice(0, 10)}.json`;

      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error(err);
      alert('匯出備份失敗');
    }
  };

  const handleImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!window.confirm('匯入備份將會完全覆蓋您目前所有的健身動作、訓練紀錄與全域設定，且無法還原。確定要繼續嗎？')) {
      e.target.value = '';
      return;
    }

    const reader = new FileReader();
    reader.onload = async (event) => {
      try {
        const json = event.target?.result as string;
        await importBackupData(json);
        await initSettings();
        await initActiveWorkout();
        alert('資料匯入成功！頁面即將重新載入。');
        window.location.reload();
      } catch (err) {
        console.error(err);
        const errMsg = err instanceof Error ? err.message : '格式錯誤';
        alert(`匯入失敗：${errMsg}`);
      }
    };
    reader.readAsText(file);
    e.target.value = ''; // clear input
  };

  return (
    <div className="p-4 max-w-md mx-auto space-y-6">
      {/* 頁面標題 */}
      <div className="space-y-1">
        <h1 className="text-lg font-bold text-slate-800 dark:text-slate-100">全域設定</h1>
        <p className="text-xs text-slate-400">
          調整量測單位、組間休息、外觀主題與資料備份。
        </p>
      </div>

      {/* 偏好設定區塊 */}
      <div className="bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 rounded-2xl p-4 shadow-sm space-y-5 transition-colors duration-200">
        {/* 1. 量測單位 */}
        <div className="space-y-2">
          <label className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
            重量單位
          </label>
          <div className="bg-slate-100 dark:bg-slate-950 p-1 rounded-xl flex gap-1 text-xs font-semibold">
            <button
              onClick={() => handleUpdate({ unit: 'kg' })}
              className={`flex-1 py-2 text-center rounded-lg transition duration-200 ${
                settings.unit === 'kg'
                  ? 'bg-white dark:bg-slate-800 text-indigo-600 dark:text-indigo-400 shadow-sm'
                  : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
              }`}
            >
              公斤 (kg)
            </button>
            <button
              onClick={() => handleUpdate({ unit: 'lb' })}
              className={`flex-1 py-2 text-center rounded-lg transition duration-200 ${
                settings.unit === 'lb'
                  ? 'bg-white dark:bg-slate-800 text-indigo-600 dark:text-indigo-400 shadow-sm'
                  : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
              }`}
            >
              磅 (lb)
            </button>
          </div>
        </div>

        {/* 2. E1RM 公式 */}
        <div className="space-y-2">
          <label className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
            預估 1RM 計算公式
          </label>
          <div className="bg-slate-100 dark:bg-slate-950 p-1 rounded-xl flex gap-1 text-xs font-semibold">
            <button
              onClick={() => handleUpdate({ e1rmFormula: 'epley' })}
              className={`flex-1 py-2 text-center rounded-lg transition duration-200 ${
                settings.e1rmFormula === 'epley'
                  ? 'bg-white dark:bg-slate-800 text-indigo-600 dark:text-indigo-400 shadow-sm'
                  : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
              }`}
            >
              Epley 公式
            </button>
            <button
              onClick={() => handleUpdate({ e1rmFormula: 'brzycki' })}
              className={`flex-1 py-2 text-center rounded-lg transition duration-200 ${
                settings.e1rmFormula === 'brzycki'
                  ? 'bg-white dark:bg-slate-800 text-indigo-600 dark:text-indigo-400 shadow-sm'
                  : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
              }`}
            >
              Brzycki 公式
            </button>
          </div>
        </div>

        {/* 3. 預設組間休息秒數 */}
        <div className="flex items-center justify-between gap-4 border-t border-slate-50 dark:border-slate-800/50 pt-4">
          <div className="space-y-0.5">
            <span className="text-sm font-bold text-slate-800 dark:text-slate-200">預設休息時間</span>
            <p className="text-[10px] text-slate-400">當新動作加入時自動套用的休息秒數</p>
          </div>
          <div className="w-32">
            <NumberStepper
              value={settings.defaultRestSeconds}
              onChange={(val) => handleUpdate({ defaultRestSeconds: Math.max(0, val) })}
              step={15}
            />
          </div>
        </div>
      </div>

      {/* 外觀與提示音區塊 */}
      <div className="bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 rounded-2xl p-4 shadow-sm space-y-5 transition-colors duration-200">
        {/* 4. 主題設定 */}
        <div className="space-y-2">
          <label className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
            應用程式主題
          </label>
          <div className="bg-slate-100 dark:bg-slate-950 p-1 rounded-xl flex gap-1 text-xs font-semibold">
            {(['light', 'dark', 'system'] as const).map((t) => (
              <button
                key={t}
                onClick={() => handleUpdate({ theme: t })}
                className={`flex-1 py-2 text-center rounded-lg capitalize transition duration-200 ${
                  settings.theme === t
                    ? 'bg-white dark:bg-slate-800 text-indigo-600 dark:text-indigo-400 shadow-sm'
                    : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
                }`}
              >
                {t === 'light' ? '淺色' : t === 'dark' ? '深色' : '系統'}
              </button>
            ))}
          </div>
        </div>

        {/* 5. 休息結束提示音 */}
        <div className="flex items-center justify-between border-t border-slate-50 dark:border-slate-800/50 pt-4">
          <div className="space-y-0.5">
            <span className="text-sm font-bold text-slate-800 dark:text-slate-200">休息結束提示音</span>
            <p className="text-[10px] text-slate-400">組間休息結束時播放清脆嗶聲</p>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={handleTestBeep}
              className="px-2 py-1 bg-slate-100 dark:bg-slate-950 hover:bg-slate-200 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-300 text-[10px] font-bold rounded-lg transition"
            >
              測試聲音
            </button>
            <input
              type="checkbox"
              checked={settings.soundOnRestEnd}
              onChange={(e) => handleUpdate({ soundOnRestEnd: e.target.checked })}
              className="w-4 h-4 text-indigo-600 border-slate-300 rounded focus:ring-indigo-500"
            />
          </div>
        </div>

        {/* 6. 休息結束震動 */}
        <div className="flex items-center justify-between border-t border-slate-50 dark:border-slate-800/50 pt-4">
          <div className="space-y-0.5">
            <span className="text-sm font-bold text-slate-800 dark:text-slate-200">休息結束震動</span>
            <p className="text-[10px] text-slate-400">組間休息結束時進行手機震動提示</p>
          </div>
          <input
            type="checkbox"
            checked={settings.vibrateOnRestEnd}
            onChange={(e) => handleUpdate({ vibrateOnRestEnd: e.target.checked })}
            className="w-4 h-4 text-indigo-600 border-slate-300 rounded focus:ring-indigo-500"
          />
        </div>
      </div>

      {/* 備份與還原 */}
      <div className="bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 rounded-2xl p-4 shadow-sm space-y-4 transition-colors duration-200">
        <label className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider block">
          資料備份與復原
        </label>
        
        <div className="grid grid-cols-2 gap-3 text-xs font-bold">
          <button
            onClick={handleExport}
            className="py-3 bg-indigo-50 dark:bg-indigo-950/30 hover:bg-indigo-100 dark:hover:bg-indigo-950/60 text-indigo-700 dark:text-indigo-400 rounded-xl transition flex items-center justify-center gap-1.5"
          >
            📥 匯出備份 (JSON)
          </button>
          
          <button
            onClick={() => fileInputRef.current?.click()}
            className="py-3 bg-slate-50 dark:bg-slate-800/50 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300 rounded-xl border border-slate-200 dark:border-slate-700 transition flex items-center justify-center gap-1.5"
          >
            📤 匯入備份 (JSON)
          </button>
        </div>

        <input
          type="file"
          ref={fileInputRef}
          onChange={handleImport}
          accept=".json"
          className="hidden"
        />
      </div>
    </div>
  );
}
