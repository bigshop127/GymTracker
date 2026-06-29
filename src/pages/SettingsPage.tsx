import React, { useRef } from 'react';
import { useSettingsStore } from '../store/settings';
import { useActiveWorkoutStore } from '../store/activeWorkout';
import { useSyncStore } from '../store/sync';
import { playRestEndSound } from '../store/restTimer';
import { exportBackupData, importBackupData } from '../lib/backup';
import NumberStepper from '../components/NumberStepper';

export default function SettingsPage() {
  const { settings, updateSettings, initSettings } = useSettingsStore();
  const { initActiveWorkout } = useActiveWorkoutStore();
  const { user, syncStatus, lastSyncAt, errorMessage, isFirebaseConfigured, signIn, signOut, sync } = useSyncStore();
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

      {/* 訓練地點管理區塊 */}
      <div className="bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 rounded-2xl p-4 shadow-sm space-y-4 transition-colors duration-200">
        <div className="space-y-1">
          <label className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider block">
            訓練地點管理
          </label>
          <p className="text-[10px] text-slate-400">管理您訓練時可以選擇的地點清單</p>
        </div>

        <div className="space-y-2">
          {(settings.locations || []).map((loc, idx) => (
            <div key={idx} className="flex items-center justify-between bg-slate-50 dark:bg-slate-950 p-2 rounded-xl text-sm">
              <span className="font-semibold text-slate-800 dark:text-slate-200">{loc}</span>
              <div className="flex gap-2">
                <button
                  onClick={() => {
                    const newName = window.prompt('重新命名地點名稱：', loc);
                    if (newName !== null && newName.trim() !== '') {
                      const updated = [...(settings.locations || [])];
                      updated[idx] = newName.trim();
                      handleUpdate({ locations: updated });
                    }
                  }}
                  className="px-2 py-1 bg-white hover:bg-slate-100 dark:bg-slate-800 dark:hover:bg-slate-700 text-xs text-slate-600 dark:text-slate-300 rounded-lg shadow-sm border border-slate-100 dark:border-slate-700 transition"
                >
                  改名
                </button>
                <button
                  onClick={() => {
                    if (window.confirm(`確定要刪除「${loc}」嗎？`)) {
                      const updated = (settings.locations || []).filter((_, i) => i !== idx);
                      handleUpdate({ locations: updated });
                    }
                  }}
                  className="px-2 py-1 bg-red-50 hover:bg-red-100 dark:bg-red-950/30 dark:hover:bg-red-950/60 text-xs text-red-600 dark:text-red-400 rounded-lg transition"
                >
                  刪除
                </button>
              </div>
            </div>
          ))}
        </div>

        <div className="flex gap-2">
          <input
            type="text"
            placeholder="新增訓練地點..."
            id="newLocationInput"
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                const target = e.currentTarget;
                const val = target.value.trim();
                if (val) {
                  if ((settings.locations || []).includes(val)) {
                    alert('此地點已存在');
                    return;
                  }
                  const updated = [...(settings.locations || []), val];
                  handleUpdate({ locations: updated });
                  target.value = '';
                }
              }
            }}
            className="flex-1 px-3 py-2 bg-slate-50 dark:bg-slate-950 text-sm text-slate-800 dark:text-slate-200 placeholder-slate-400 border border-slate-100 dark:border-slate-800 rounded-xl focus:outline-none focus:ring-1 focus:ring-indigo-500"
          />
          <button
            onClick={() => {
              const input = document.getElementById('newLocationInput') as HTMLInputElement;
              const val = input?.value.trim();
              if (val) {
                if ((settings.locations || []).includes(val)) {
                  alert('此地點已存在');
                  return;
                }
                const updated = [...(settings.locations || []), val];
                handleUpdate({ locations: updated });
                input.value = '';
              }
            }}
            className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-xs font-bold text-white rounded-xl transition"
          >
            新增
          </button>
        </div>
      </div>

      {/* 帳號與雲端同步 */}
      {isFirebaseConfigured && (
        <div className="bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 rounded-2xl p-4 shadow-sm space-y-4 transition-colors duration-200">
          <label className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider block">
            帳號與雲端同步
          </label>

          {!user ? (
            <div className="space-y-3">
              <p className="text-xs text-slate-500 dark:text-slate-400">
                使用 Google 帳號登入，即可在多台裝置間自動同步訓練資料。
              </p>
              <button
                onClick={signIn}
                disabled={syncStatus === 'syncing'}
                className="w-full py-3 flex items-center justify-center gap-2 bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 font-bold text-sm rounded-xl shadow-sm transition disabled:opacity-60"
              >
                <svg viewBox="0 0 24 24" className="w-5 h-5" xmlns="http://www.w3.org/2000/svg">
                  <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
                  <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                  <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
                  <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
                </svg>
                使用 Google 帳號登入
              </button>
            </div>
          ) : (
            <div className="space-y-3">
              {/* 使用者資訊 */}
              <div className="flex items-center gap-3 p-3 bg-slate-50 dark:bg-slate-950 rounded-xl">
                {user.photoURL && (
                  <img src={user.photoURL} alt="" className="w-9 h-9 rounded-full shrink-0" />
                )}
                <div className="min-w-0">
                  <p className="text-sm font-bold text-slate-800 dark:text-slate-100 truncate">{user.displayName}</p>
                  <p className="text-[10px] text-slate-400 truncate">{user.email}</p>
                </div>
              </div>

              {/* 同步狀態 */}
              <div className="flex items-center justify-between text-xs">
                <span className="text-slate-500 dark:text-slate-400">
                  {syncStatus === 'syncing' ? (
                    <span className="flex items-center gap-1.5">
                      <span className="w-2 h-2 bg-amber-400 rounded-full animate-ping" />
                      同步中...
                    </span>
                  ) : syncStatus === 'error' ? (
                    <span className="text-rose-500">{errorMessage}</span>
                  ) : lastSyncAt ? (
                    <span className="flex items-center gap-1.5">
                      <span className="w-2 h-2 bg-emerald-500 rounded-full" />
                      上次同步：{new Date(lastSyncAt).toLocaleTimeString()}
                    </span>
                  ) : (
                    '尚未同步'
                  )}
                </span>
                <button
                  onClick={sync}
                  disabled={syncStatus === 'syncing'}
                  className="px-3 py-1.5 bg-indigo-50 dark:bg-indigo-950/30 hover:bg-indigo-100 dark:hover:bg-indigo-950/60 text-indigo-700 dark:text-indigo-400 text-[11px] font-bold rounded-lg transition disabled:opacity-60"
                >
                  立即同步
                </button>
              </div>

              <button
                onClick={signOut}
                className="w-full py-2.5 bg-slate-50 dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300 text-xs font-bold rounded-xl border border-slate-200 dark:border-slate-700 transition"
              >
                登出
              </button>
            </div>
          )}
        </div>
      )}

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
