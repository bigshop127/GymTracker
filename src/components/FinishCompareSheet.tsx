import { type Exercise, type Unit } from '../db/schema';
import { type SetSummary, type TemplateChange } from '../lib/templateDiff';
import { formatWeight } from '../lib/units';

interface FinishCompareSheetProps {
  /** 例：「拉 (Pull)」 */
  templateName: string;
  /** 從課表開的訓練（措辭用「課表」），否則是一般範本 */
  isProgram: boolean;
  changes: TemplateChange[];
  exerciseMap: Map<string, Exercise>;
  unit: Unit;
  busy: boolean;
  onUpdate: () => void;
  onTodayOnly: () => void;
  onSaveAsNew: () => void;
  onBack: () => void;
}

/**
 * 完成訓練前：列出這次跟範本／課表不一樣的地方，讓使用者選
 * 「更新，之後照這樣」或「只有今天這樣」。z-[60] 蓋過底部導覽列（z-50）。
 */
export default function FinishCompareSheet({
  templateName,
  isProgram,
  changes,
  exerciseMap,
  unit,
  busy,
  onUpdate,
  onTodayOnly,
  onSaveAsNew,
  onBack,
}: FinishCompareSheetProps) {
  const target = isProgram ? '課表' : '範本';
  const nameOf = (id: string) => exerciseMap.get(id)?.name ?? '（已刪除的動作）';

  const formatSummary = (s: SetSummary) => {
    if (s.minutes > 0) return `${s.sets}組 · ${s.minutes}分`;
    const reps = s.minReps === s.maxReps ? `${s.minReps}` : `${s.minReps}-${s.maxReps}`;
    return `${s.sets}組 · ${formatWeight(s.topWeight, unit)}${unit} × ${reps}`;
  };

  return (
    <div className="fixed inset-0 bg-black/40 dark:bg-slate-950/60 backdrop-blur-sm z-[60] flex items-end justify-center">
      <div className="fixed inset-0" onClick={busy ? undefined : onBack} />
      <div className="relative bg-white dark:bg-slate-900 w-full max-w-md rounded-t-2xl shadow-xl z-10 p-5 space-y-4 max-h-[85vh] overflow-y-auto animate-slide-up">
        <div className="space-y-1 border-b border-slate-100 dark:border-slate-800 pb-3">
          <h3 className="font-bold text-slate-800 dark:text-slate-100 text-base">這次跟{target}不一樣</h3>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            {target}「{templateName}」預定的內容 → 今天實際做的
          </p>
        </div>

        <ul className="space-y-2">
          {changes.map((change, i) => {
            if (change.kind === 'reordered') {
              return (
                <li key={i} className="text-xs font-semibold text-slate-600 dark:text-slate-300">
                  ↕ 動作順序不同
                </li>
              );
            }
            if (change.kind === 'added') {
              return (
                <li key={i} className="text-xs font-semibold text-emerald-700 dark:text-emerald-400">
                  ＋ 多做：{nameOf(change.exerciseId)}
                </li>
              );
            }
            if (change.kind === 'removed') {
              return (
                <li key={i} className="text-xs font-semibold text-rose-600 dark:text-rose-400">
                  － 沒做：{nameOf(change.exerciseId)}
                </li>
              );
            }
            return (
              <li key={i} className="text-xs space-y-0.5">
                <p className="font-bold text-slate-800 dark:text-slate-200">
                  {nameOf(change.exerciseId)}
                  {change.swappedFromExerciseId && (
                    <span className="font-semibold text-indigo-600 dark:text-indigo-400">
                      （替代：原本選 {nameOf(change.swappedFromExerciseId)}）
                    </span>
                  )}
                </p>
                <p className="font-semibold text-slate-600 dark:text-slate-300">
                  {change.before ? formatSummary(change.before) : '第一次做這個替代動作'}
                  {' → '}
                  <span className="text-slate-900 dark:text-white">{formatSummary(change.after)}</span>
                </p>
                {change.weeklyLocked && (
                  <p className="text-[10px] text-amber-600 dark:text-amber-400">
                    組數／次數照課表週次安排，更新只會改重量
                  </p>
                )}
              </li>
            );
          })}
        </ul>

        <div className="space-y-2 pt-1">
          <button
            type="button"
            disabled={busy}
            onClick={onUpdate}
            className="w-full py-3 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white font-bold rounded-xl text-sm shadow-md cursor-pointer"
          >
            更新{target}，之後照這樣
          </button>
          <p className="text-[10px] text-slate-400 text-center -mt-1">
            下次{isProgram ? '輪到這天' : '用這份範本'}會照今天的動作、組數、重量開始
          </p>
          <button
            type="button"
            disabled={busy}
            onClick={onTodayOnly}
            className="w-full py-3 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 disabled:opacity-50 text-slate-700 dark:text-slate-200 font-bold rounded-xl text-sm cursor-pointer"
          >
            只有今天這樣（{target}不變）
          </button>
          <div className="flex justify-between pt-1">
            <button
              type="button"
              disabled={busy}
              onClick={onBack}
              className="text-xs font-bold text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 cursor-pointer"
            >
              ← 回去繼續訓練
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={onSaveAsNew}
              className="text-xs font-bold text-indigo-600 dark:text-indigo-400 hover:underline cursor-pointer"
            >
              另存成新範本…
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
