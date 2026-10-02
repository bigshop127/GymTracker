import { useEffect, useMemo, useState } from 'react';
import { type Exercise, type TrainingProgram, type Workout } from '../db/schema';
import { listCompletedWorkouts } from '../db/workouts';
import {
  buildLapHistory,
  formatRepsRange,
  hasLapChange,
  type LapEntryDiff,
  type LapEntrySummary,
} from '../lib/lapHistory';
import { weekIdxForCycle } from '../lib/programWeeks';
import { formatWeight } from '../lib/units';
import { useSettingsStore } from '../store/settings';

const WEEKDAYS = ['日', '一', '二', '三', '四', '五', '六'];
const PAGE_SIZE = 10;

interface LapHistorySectionProps {
  program: TrainingProgram;
  exerciseMap: Map<string, Exercise>;
  /** 課表有週次組數時，輪數旁邊標用的是哪一週（W1~W8） */
  showWeek: boolean;
}

interface Badge {
  text: string;
  tone: 'up' | 'down' | 'neutral' | 'new';
}

const BADGE_CLASSES: Record<Badge['tone'], string> = {
  up: 'bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-300',
  down: 'bg-rose-100 dark:bg-rose-900/40 text-rose-700 dark:text-rose-300',
  neutral: 'bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300',
  new: 'bg-indigo-100 dark:bg-indigo-900/40 text-indigo-700 dark:text-indigo-300',
};

function formatDate(timestamp: number): string {
  const d = new Date(timestamp);
  return `${d.getFullYear()}/${d.getMonth() + 1}/${d.getDate()}（${WEEKDAYS[d.getDay()]}）`;
}

/** 課表頁「每輪紀錄」：選一天，依輪數列出每個動作實際做的組數×次數＠重量，跟上一次不同的地方標出來 */
export default function LapHistorySection({ program, exerciseMap, showWeek }: LapHistorySectionProps) {
  const { settings } = useSettingsStore();
  const unit = settings?.unit ?? 'kg';
  const [workouts, setWorkouts] = useState<Workout[] | null>(null);
  const [selectedSlotId, setSelectedSlotId] = useState<string | null>(null);
  const [limit, setLimit] = useState(PAGE_SIZE);

  useEffect(() => {
    let active = true;
    listCompletedWorkouts()
      .then((list) => {
        if (active) setWorkouts(list);
      })
      .catch((err) => {
        console.error('Failed to load workouts for lap history:', err);
        if (active) setWorkouts([]);
      });
    return () => {
      active = false;
    };
  }, []);

  const slot = program.slots.find((s) => s.id === selectedSlotId) ?? program.slots[0];
  const records = useMemo(
    () => (workouts && slot ? buildLapHistory(workouts, slot, program.id) : []),
    [workouts, slot, program.id]
  );

  const weightText = (kg: number) => `${formatWeight(kg, unit)}${unit}`;

  const summaryText = (s: LapEntrySummary): string => {
    if (s.minutes > 0 && s.topWeight === 0 && s.maxReps === 0) return `${s.minutes} 分鐘`;
    const base = `${s.sets}×${formatRepsRange(s.minReps, s.maxReps)}`;
    if (s.topWeight > 0) return `${base} @${weightText(s.topWeight)}`;
    if (s.minAssist !== undefined) return `${base} 輔助${weightText(s.minAssist)}`;
    return base;
  };

  const badgesOf = (diff: LapEntryDiff | null): Badge[] => {
    if (!diff) return [];
    if (diff.isNew) return [{ text: '新動作', tone: 'new' }];
    const badges: Badge[] = [];
    if (diff.weightDelta > 0) badges.push({ text: `▲ +${weightText(diff.weightDelta)}`, tone: 'up' });
    if (diff.weightDelta < 0) badges.push({ text: `▼ −${weightText(-diff.weightDelta)}`, tone: 'down' });
    if (diff.assistDelta < 0) badges.push({ text: `▲ 輔助 −${weightText(-diff.assistDelta)}`, tone: 'up' });
    if (diff.assistDelta > 0) badges.push({ text: `▼ 輔助 +${weightText(diff.assistDelta)}`, tone: 'down' });
    if (diff.sets) badges.push({ text: `組數 ${diff.sets[0]}→${diff.sets[1]}`, tone: 'neutral' });
    if (diff.reps) badges.push({ text: `次數 ${diff.reps[0]}→${diff.reps[1]}`, tone: 'neutral' });
    return badges;
  };

  const exerciseName = (id: string) => exerciseMap.get(id)?.name ?? '（已刪除的動作）';

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-relaxed">
          每一筆是從課表開始的那天訓練，列出實際做的組數×次數＠最重一組；跟上一次不一樣的地方會標出來。
        </p>
        <div className="flex flex-wrap gap-1.5">
          {program.slots.map((s) => {
            const isSelected = s.id === slot?.id;
            return (
              <button
                key={s.id}
                type="button"
                onClick={() => {
                  setSelectedSlotId(s.id);
                  setLimit(PAGE_SIZE);
                }}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold transition cursor-pointer ${
                  isSelected
                    ? 'bg-indigo-600 text-white shadow-sm'
                    : 'bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700'
                }`}
              >
                {s.label}
              </button>
            );
          })}
        </div>
      </div>

      {workouts === null ? (
        <p className="text-xs text-slate-400 text-center py-6">載入中...</p>
      ) : records.length === 0 ? (
        <div className="bg-white dark:bg-slate-900 border border-dashed border-slate-300 dark:border-slate-700 rounded-2xl p-6 text-center">
          <p className="text-xs text-slate-400">「{slot?.label}」還沒有從課表開始的訓練紀錄。</p>
        </div>
      ) : (
        <div className="space-y-3">
          {records.slice(0, limit).map((record) => {
            const lapLabel = record.lap !== null ? `第 ${record.lap} 輪` : '沒記到輪數';
            const weekLabel = showWeek && record.lap !== null ? ` · W${weekIdxForCycle(record.lap) + 1}` : '';
            const isFirst = record.entries.every((e) => e.diff === null);
            const unchanged =
              !isFirst && record.droppedExerciseIds.length === 0 && !record.entries.some((e) => hasLapChange(e.diff));
            return (
              <div
                key={record.workout.id}
                className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-3.5 shadow-sm space-y-2.5"
              >
                <div className="flex justify-between items-baseline gap-2">
                  <span className="text-sm font-extrabold text-slate-800 dark:text-slate-100">
                    {record.fromOtherRun && (
                      <span className="text-[10px] font-bold text-slate-400 mr-1">前次計畫</span>
                    )}
                    {lapLabel}
                    <span className="text-xs font-bold text-slate-400">{weekLabel}</span>
                  </span>
                  <span className="text-[11px] font-semibold text-slate-400 shrink-0">{formatDate(record.workout.startedAt)}</span>
                </div>

                <div className="divide-y divide-slate-100 dark:divide-slate-800">
                  {record.entries.map(({ summary, diff }) => {
                    const badges = badgesOf(diff);
                    return (
                      <div key={summary.exerciseId} className="py-1.5 flex flex-wrap items-center gap-x-2 gap-y-1">
                        <span className="text-xs font-bold text-slate-700 dark:text-slate-200 min-w-0 flex-1 truncate">
                          {exerciseName(summary.exerciseId)}
                        </span>
                        <span className="text-xs font-semibold text-slate-500 dark:text-slate-400 tabular-nums shrink-0">
                          {summaryText(summary)}
                        </span>
                        {badges.length > 0 && (
                          <span className="basis-full flex flex-wrap gap-1">
                            {badges.map((b) => (
                              <span key={b.text} className={`text-[10px] font-bold px-1.5 py-0.5 rounded-md ${BADGE_CLASSES[b.tone]}`}>
                                {b.text}
                              </span>
                            ))}
                          </span>
                        )}
                      </div>
                    );
                  })}
                </div>

                {record.droppedExerciseIds.length > 0 && (
                  <p className="text-[10px] font-semibold text-slate-400">
                    這次沒做：{record.droppedExerciseIds.map(exerciseName).join('、')}
                  </p>
                )}
                {unchanged && <p className="text-[10px] font-semibold text-slate-400">跟上一次一樣</p>}
                {isFirst && record.entries.length > 0 && (
                  <p className="text-[10px] font-semibold text-slate-400">最早的一筆，沒有可以比較的</p>
                )}
              </div>
            );
          })}
          {records.length > limit && (
            <button
              type="button"
              onClick={() => setLimit(limit + PAGE_SIZE)}
              className="w-full py-2.5 bg-white dark:bg-slate-900 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-300 text-xs font-bold rounded-xl border border-slate-200 dark:border-slate-800 transition cursor-pointer"
            >
              顯示更早的 {Math.min(PAGE_SIZE, records.length - limit)} 筆
            </button>
          )}
        </div>
      )}
    </div>
  );
}
