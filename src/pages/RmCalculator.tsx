import { useState } from 'react';
import NumberStepper from '../components/NumberStepper';
import { useSettingsStore } from '../store/settings';
import { calculateE1rm } from '../lib/e1rm';

export default function RmCalculator() {
  const settings = useSettingsStore((s) => s.settings);
  const unit = settings?.unit || 'kg';
  const formula = settings?.e1rmFormula || 'epley';

  const [weight, setWeight] = useState<number>(100);
  const [reps, setReps] = useState<number>(5);

  const calculated1rm = (weight <= 0 || reps <= 0)
    ? null
    : calculateE1rm(weight, reps, formula);

  const formulaLabel = formula === 'brzycki' ? 'Brzycki' : 'Epley';

  return (
    <div className="p-4 max-w-md mx-auto space-y-6">
      {/* 頁面標題 */}
      <div className="space-y-1">
        <h1 className="text-lg font-bold text-slate-800 dark:text-slate-100">1RM 計算機</h1>
        <p className="text-xs text-slate-400">
          輸入你剛完成的重量與次數，估算單次最大肌力。
        </p>
      </div>

      {/* 計算卡片 */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 shadow-sm space-y-6 transition-colors duration-200">
        <div className="space-y-4">
          {/* 重量輸入 */}
          <div className="space-y-2">
            <label className="text-xs font-bold text-slate-500 dark:text-slate-400 block">
              重量 ({unit})
            </label>
            <NumberStepper
              value={weight}
              onChange={setWeight}
              step={2.5}
              min={0}
              decimals={1}
            />
          </div>

          {/* 次數輸入 */}
          <div className="space-y-2">
            <label className="text-xs font-bold text-slate-500 dark:text-slate-400 block">
              次數 (Reps)
            </label>
            <NumberStepper
              value={reps}
              onChange={setReps}
              step={1}
              min={1}
              max={20}
              decimals={0}
            />
          </div>
        </div>

        {/* 結果顯示 */}
        <div className="pt-6 border-t border-slate-100 dark:border-slate-800 text-center space-y-2">
          <div className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider">
            估算 1RM 最大肌力
          </div>
          <div className="text-5xl font-extrabold text-indigo-600 dark:text-indigo-400 font-mono tracking-tight min-h-[3rem] flex items-center justify-center">
            {calculated1rm !== null ? calculated1rm.toFixed(1) : '--'}
            {calculated1rm !== null && (
              <span className="text-base font-medium text-slate-400 dark:text-slate-500 ml-1">
                {unit}
              </span>
            )}
          </div>
          <p className="text-[10px] text-slate-400 dark:text-slate-500">
            使用 {formulaLabel} 公式估算・可於設定頁調整
          </p>
        </div>
      </div>
    </div>
  );
}
