import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useProgramStore } from '../store/program';
import { isZongYuanProgramImported, importZongYuanProgram } from '../lib/importZongYuanProgram';
import {
  ZONGYUAN_8WEEK_PLAN,
  ZONGYUAN_WEEK_LABELS,
  ZONGYUAN_COACH_CHECK_TABLE,
  ZONGYUAN_PROGRAM_NAME,
} from '../data/zongyuan-8week-program';

export default function ProgramGuide() {
  const navigate = useNavigate();
  const { activeProgram, initProgram } = useProgramStore();
  const [isImported, setIsImported] = useState<boolean | null>(null);
  const [isImporting, setIsImporting] = useState(false);
  // null = 尚未手動選過週次，跟著目前計畫進度自動顯示
  const [manualWeek, setManualWeek] = useState<number | null>(null);

  useEffect(() => {
    initProgram();
    isZongYuanProgramImported().then(setIsImported);
  }, [initProgram]);

  const isActiveHere = activeProgram?.name === ZONGYUAN_PROGRAM_NAME;
  const autoWeek = isActiveHere ? Math.min(8, Math.max(1, activeProgram.cycleCount + 1)) : 1;
  const selectedWeek = manualWeek ?? autoWeek;

  const handleImport = async () => {
    if (activeProgram && activeProgram.name !== ZONGYUAN_PROGRAM_NAME) {
      const confirmEnd = window.confirm(
        `目前已有進行中的計畫「${activeProgram.name}」，匯入這份課表將會結束它，確定嗎？`
      );
      if (!confirmEnd) return;
    }
    setIsImporting(true);
    try {
      await importZongYuanProgram();
      await initProgram();
      setIsImported(true);
      alert('匯入成功！到「訓練」頁即可開始今天該練的項目。');
    } catch (err) {
      console.error('Failed to import ZongYuan program:', err);
      alert('匯入失敗，請稍後再試。');
    } finally {
      setIsImporting(false);
    }
  };

  return (
    <div className="p-4 max-w-md mx-auto space-y-6 pb-10">
      <div className="space-y-1.5">
        <h2 className="text-lg font-bold text-slate-800 dark:text-slate-200">{ZONGYUAN_PROGRAM_NAME}</h2>
        <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
          共 8 週，每週 4 練（拉／推／腿／手），組數與次數依週漸進；W4 減量週、W8 測試/收尾週。
        </p>
      </div>

      {/* 匯入狀態卡片 */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 shadow-sm space-y-3">
        {isImported === null ? (
          <p className="text-xs text-slate-400 text-center py-2">載入中...</p>
        ) : isImported ? (
          <div className="space-y-2.5">
            <p className="text-xs font-bold text-emerald-600 dark:text-emerald-400 flex items-center gap-1.5">
              ✅ 已匯入到我的訓練範本／計畫
            </p>
            {isActiveHere && (
              <p className="text-[11px] text-slate-400 font-semibold">
                目前第 {activeProgram.cycleCount + 1} 輪（約第 {Math.min(8, activeProgram.cycleCount + 1)} 週）
              </p>
            )}
            <button
              onClick={() => navigate('/')}
              className="w-full py-2.5 bg-indigo-600 hover:bg-indigo-700 active:bg-indigo-800 text-white font-bold rounded-xl text-xs transition cursor-pointer"
            >
              前往訓練頁
            </button>
          </div>
        ) : (
          <div className="space-y-2.5">
            <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
              點下方按鈕會自動建立「拉／推／腿／手」4 個訓練範本＋1 個訓練計畫（缺少的動作會新增為自訂動作），之後就能直接開始訓練並自動記錄歷史與進度。
            </p>
            <button
              onClick={handleImport}
              disabled={isImporting}
              className="w-full py-3 bg-indigo-600 hover:bg-indigo-700 active:bg-indigo-800 disabled:opacity-50 text-white font-bold rounded-xl text-sm shadow-md shadow-indigo-100 dark:shadow-none transition cursor-pointer"
            >
              {isImporting ? '匯入中...' : '🎯 匯入到我的訓練'}
            </button>
          </div>
        )}
      </div>

      {/* 週次選擇 */}
      <div className="space-y-2.5">
        <h3 className="text-xs font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider">選擇週次</h3>
        <div className="flex gap-1.5 overflow-x-auto pb-1 -mx-1 px-1">
          {ZONGYUAN_WEEK_LABELS.map((label, idx) => {
            const week = idx + 1;
            const isSelected = week === selectedWeek;
            return (
              <button
                key={week}
                onClick={() => setManualWeek(week)}
                className={`shrink-0 px-3 py-2 rounded-xl text-xs font-bold transition cursor-pointer ${
                  isSelected
                    ? 'bg-indigo-600 text-white shadow-sm'
                    : 'bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700'
                }`}
              >
                {label}
              </button>
            );
          })}
        </div>
      </div>

      {/* 4 天課表卡片 */}
      <div className="space-y-4">
        {ZONGYUAN_8WEEK_PLAN.map((day) => (
          <div
            key={day.label}
            className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 shadow-sm space-y-3"
          >
            <div className="flex justify-between items-center">
              <h4 className="font-bold text-slate-800 dark:text-slate-200 text-sm">{day.label}</h4>
              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-indigo-50 dark:bg-indigo-950/40 text-indigo-600 dark:text-indigo-400">
                當週總計 {day.weeklyTotalSets[selectedWeek - 1]}
              </span>
            </div>
            <div className="space-y-2">
              {day.exercises.map((ex, idx) => (
                <div
                  key={`${ex.planName}-${idx}`}
                  className="flex justify-between items-center gap-3 py-1.5 border-b border-slate-50 dark:border-slate-800/60 last:border-0"
                >
                  <div className="min-w-0">
                    <p className="text-xs font-semibold text-slate-700 dark:text-slate-300 truncate">{ex.planName}</p>
                    {ex.isNewCustom ? (
                      <p className="text-[10px] text-amber-600 dark:text-amber-400 font-medium">將新增為自訂動作</p>
                    ) : ex.exerciseName !== ex.planName ? (
                      <p className="text-[10px] text-slate-400 font-medium">對應動作庫：{ex.exerciseName}</p>
                    ) : null}
                  </div>
                  <span className="shrink-0 text-xs font-bold text-slate-800 dark:text-slate-200 text-right">
                    {ex.weekly[selectedWeek - 1]}
                  </span>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>

      {/* 教練原始容量覆核對照（次要參考資訊） */}
      <details className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 shadow-sm">
        <summary className="text-xs font-bold text-slate-500 dark:text-slate-400 cursor-pointer select-none">
          {ZONGYUAN_COACH_CHECK_TABLE.title}
        </summary>
        <div className="mt-3 overflow-x-auto">
          <table className="w-full text-[10px] text-left border-collapse">
            <thead>
              <tr className="text-slate-400 dark:text-slate-500">
                <th className="pr-2 pb-1.5 font-bold">部位</th>
                {ZONGYUAN_WEEK_LABELS.map((w) => (
                  <th key={w} className="px-1.5 pb-1.5 font-bold text-center whitespace-nowrap">
                    {w.replace('（減量）', '').replace('（測試）', '')}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {ZONGYUAN_COACH_CHECK_TABLE.rows.map((row) => (
                <tr key={row.part} className="border-t border-slate-50 dark:border-slate-800/60">
                  <td className="pr-2 py-1.5 font-semibold text-slate-600 dark:text-slate-300 whitespace-nowrap">
                    {row.part}
                  </td>
                  {row.values.map((v, i) => (
                    <td key={i} className="px-1.5 py-1.5 text-center font-bold text-slate-700 dark:text-slate-300">
                      {v}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </div>
  );
}
