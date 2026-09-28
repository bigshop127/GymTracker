import { useEffect, useState } from 'react';
import { type Exercise, type SetLog, type Workout, type WorkoutEntry, type WorkoutTemplate } from '../db/schema';
import { listCompletedWorkouts } from '../db/workouts';
import { getExerciseSessions } from '../lib/exerciseSessions';
import { clonePlannedSets, defaultAlternativeSets } from '../lib/workoutEntries';
import {
  type WeekEditScope,
  addDraftAlternative,
  addDraftEntry,
  applyWeekEdit,
  isSkippedInWeek,
  moveDraftEntry,
  plannedCount,
  removeDraftAlternative,
  replaceDraftExercise,
  restoreDraftEntry,
  setDraftTarget,
  skipDraftEntry,
  startWeekEdit,
  weekTargetOf,
} from '../lib/programWeeks';
import ExerciseList from './ExerciseList';
import NumberStepper from './NumberStepper';

interface ProgramDayEditCardProps {
  /** 例：「拉 (Pull)」 */
  label: string;
  template: WorkoutTemplate;
  weekIdx: number;
  /** 例：「W3」「W4（減量）」 */
  weekLabel: string;
  exerciseMap: Map<string, Exercise>;
  onCancel: () => void;
  onSave: (updated: WorkoutTemplate) => Promise<void>;
}

type PickerState = { mode: 'add' } | { mode: 'replace'; entryId: string } | { mode: 'alt'; entryId: string };

/**
 * 課表頁某一天的編輯卡片。數字只改正在看的這一週，全部先放草稿，
 * 按「套用到全部 8 週」或「只改這週」才存回範本（規則見 lib/programWeeks applyWeekEdit）。
 */
export default function ProgramDayEditCard({
  label,
  template,
  weekIdx,
  weekLabel,
  exerciseMap,
  onCancel,
  onSave,
}: ProgramDayEditCardProps) {
  const [draft, setDraft] = useState(() => startWeekEdit(template, weekIdx));
  const [isDirty, setIsDirty] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [picker, setPicker] = useState<PickerState | null>(null);
  // 動作庫裡剛新增的自訂動作不在 exerciseMap 裡，名字先記在這
  const [pickedExercises, setPickedExercises] = useState<Map<string, Exercise>>(new Map());
  // 替代動作的起始重量用上次實際做它的紀錄
  const [completedWorkouts, setCompletedWorkouts] = useState<Workout[]>([]);

  useEffect(() => {
    let cancelled = false;
    listCompletedWorkouts()
      .then((workouts) => {
        if (!cancelled) setCompletedWorkouts(workouts);
      })
      .catch((err) => console.error('Failed to load history for alternatives:', err));
    return () => {
      cancelled = true;
    };
  }, []);

  const nameOf = (id: string) => exerciseMap.get(id)?.name ?? pickedExercises.get(id)?.name ?? '未知動作';

  const update = (next: typeof draft) => {
    setDraft(next);
    setIsDirty(true);
  };

  /** 替代動作第一次有自己的數字時存的起始組：上次做它的紀錄，沒做過就重量 0 */
  const baseSetsFor = (exerciseId: string, entry: WorkoutEntry): SetLog[] => {
    const last = getExerciseSessions(completedWorkouts, exerciseId)[0];
    return last ? clonePlannedSets(last.sets) : defaultAlternativeSets(entry.sets);
  };

  const handleSkip = (entryId: string) => {
    if (plannedCount(draft) <= 1) {
      alert('這天這週至少要留一個動作');
      return;
    }
    update(skipDraftEntry(draft, entryId));
  };

  const handlePick = (exercise: Exercise) => {
    if (!picker) return;
    setPickedExercises((prev) => new Map(prev).set(exercise.id, exercise));
    if (picker.mode === 'add') {
      update(addDraftEntry(draft, exercise.id));
    } else if (picker.mode === 'replace') {
      update(replaceDraftExercise(draft, picker.entryId, exercise.id));
    } else {
      const entry = draft.entries.find((e) => e.id === picker.entryId);
      if (entry) {
        if (exercise.muscleGroup === '有氧') {
          alert('替代動作暫不支援有氧');
        } else if (entry.exerciseId !== exercise.id && !entry.candidateExerciseIds?.includes(exercise.id)) {
          update(addDraftAlternative(draft, entry.id, exercise.id, baseSetsFor(exercise.id, entry)));
        }
      }
    }
    setPicker(null);
  };

  const handleCancel = () => {
    if (isDirty && !window.confirm('這次的修改還沒儲存，確定要放棄嗎？')) return;
    onCancel();
  };

  const handleSave = async (scope: WeekEditScope) => {
    if (!isDirty) {
      onCancel();
      return;
    }
    setIsSaving(true);
    try {
      await onSave(applyWeekEdit(template, draft, scope));
    } catch (err) {
      console.error('Failed to save program day:', err);
      alert('儲存失敗，請稍後再試。');
      setIsSaving(false);
    }
  };

  return (
    <div className="bg-white dark:bg-slate-900 border-2 border-indigo-300 dark:border-indigo-700 rounded-2xl p-4 shadow-sm space-y-3">
      <div className="flex justify-between items-center gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <h4 className="font-bold text-slate-800 dark:text-slate-200 text-sm truncate">{label}</h4>
          <span className="shrink-0 text-[10px] font-bold px-2 py-0.5 rounded-full bg-indigo-600 text-white">
            編輯 {weekLabel}
          </span>
        </div>
        <button
          type="button"
          onClick={handleCancel}
          disabled={isSaving}
          className="shrink-0 text-[10px] font-bold px-2.5 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700 transition cursor-pointer"
        >
          取消
        </button>
      </div>
      <p className="text-[10px] text-slate-400 font-semibold leading-relaxed">
        組數、次數顯示的是 {weekLabel}。改完按最下面的按鈕，再選要套用到 8 週還是只改這週。
      </p>

      <div className="space-y-2">
        {draft.entries.length === 0 && (
          <p className="text-xs text-slate-400 text-center py-3">還沒有動作，按下面「＋ 新增動作」開始加。</p>
        )}
        {draft.entries.map((entry, idx) => {
          const name = nameOf(entry.exerciseId);
          if (isSkippedInWeek(entry, draft.weekIdx)) {
            return (
              <div
                key={entry.id}
                className="flex justify-between items-center gap-2 py-1.5 border-b border-slate-50 dark:border-slate-800/60 last:border-0"
              >
                <p className="min-w-0 flex-1 text-xs font-semibold text-slate-400 dark:text-slate-500 line-through truncate">
                  {name}
                </p>
                <span className="shrink-0 text-[10px] font-bold text-slate-400">這週不做</span>
                <button
                  type="button"
                  onClick={() => update(restoreDraftEntry(draft, template, entry.id))}
                  className="shrink-0 text-[10px] font-bold px-2 py-0.5 rounded-full bg-indigo-50 dark:bg-indigo-950/40 text-indigo-600 dark:text-indigo-400 hover:bg-indigo-100 dark:hover:bg-indigo-900/50 transition cursor-pointer"
                >
                  加回來
                </button>
              </div>
            );
          }
          const target = weekTargetOf(entry, draft.weekIdx);
          const alternatives = (entry.candidateExerciseIds ?? []).filter((id) => id !== entry.exerciseId);
          return (
            <div
              key={entry.id}
              className="py-1.5 border-b border-slate-50 dark:border-slate-800/60 last:border-0 space-y-1.5"
            >
              <div className="flex justify-between items-center gap-2">
                <button
                  type="button"
                  onClick={() => setPicker({ mode: 'replace', entryId: entry.id })}
                  className="min-w-0 flex-1 text-left text-xs font-semibold text-indigo-600 dark:text-indigo-400 truncate underline decoration-dotted cursor-pointer"
                >
                  {name}
                </button>
                <div className="flex items-center gap-0.5 shrink-0">
                  <button
                    type="button"
                    aria-label="上移"
                    onClick={() => update(moveDraftEntry(draft, entry.id, 'up'))}
                    disabled={idx === 0}
                    className="p-1 text-slate-400 disabled:opacity-30 hover:text-slate-700 dark:hover:text-slate-200 cursor-pointer"
                  >
                    <svg fill="none" viewBox="0 0 24 24" strokeWidth="3" stroke="currentColor" className="w-3.5 h-3.5">
                      <path strokeLinecap="round" strokeLinejoin="round" d="m4.5 15.75 7.5-7.5 7.5 7.5" />
                    </svg>
                  </button>
                  <button
                    type="button"
                    aria-label="下移"
                    onClick={() => update(moveDraftEntry(draft, entry.id, 'down'))}
                    disabled={idx === draft.entries.length - 1}
                    className="p-1 text-slate-400 disabled:opacity-30 hover:text-slate-700 dark:hover:text-slate-200 cursor-pointer"
                  >
                    <svg fill="none" viewBox="0 0 24 24" strokeWidth="3" stroke="currentColor" className="w-3.5 h-3.5">
                      <path strokeLinecap="round" strokeLinejoin="round" d="m19.5 8.25-7.5 7.5-7.5-7.5" />
                    </svg>
                  </button>
                  <button
                    type="button"
                    aria-label="移除動作"
                    onClick={() => handleSkip(entry.id)}
                    className="p-1 text-slate-400 hover:text-rose-600 dark:hover:text-rose-400 cursor-pointer"
                  >
                    <svg fill="none" viewBox="0 0 24 24" strokeWidth="2.5" stroke="currentColor" className="w-3.5 h-3.5">
                      <path strokeLinecap="round" strokeLinejoin="round" d="m14.74 9-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 0 1-2.244 2.077H8.084a2.25 2.25 0 0 1-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 0 0-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 0 1 3.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 0 0-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 0 0-7.5 0" />
                    </svg>
                  </button>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-0.5">
                  <span className="text-[9px] font-bold text-slate-400 block">{weekLabel} 組數</span>
                  <NumberStepper
                    value={target.sets}
                    onChange={(v) => update(setDraftTarget(draft, entry.id, entry.exerciseId, { sets: v }))}
                    step={1}
                    min={1}
                    max={20}
                    decimals={0}
                  />
                </div>
                <div className="space-y-0.5">
                  <span className="text-[9px] font-bold text-slate-400 block">次數</span>
                  <NumberStepper
                    value={target.reps}
                    onChange={(v) => update(setDraftTarget(draft, entry.id, entry.exerciseId, { reps: v }))}
                    step={1}
                    min={1}
                    max={50}
                    decimals={0}
                  />
                </div>
              </div>
              {target.note && (
                <p className="text-[10px] text-amber-600 dark:text-amber-400">
                  原始教練備註：{target.note}（調整組數/次數後會蓋掉這則備註）
                </p>
              )}

              {alternatives.map((altId) => {
                const altTarget = weekTargetOf(entry, draft.weekIdx, altId);
                return (
                  <div
                    key={altId}
                    className="ml-3 pl-2.5 border-l-2 border-indigo-100 dark:border-indigo-900 space-y-1"
                  >
                    <div className="flex justify-between items-center gap-2">
                      <p className="min-w-0 flex-1 text-[11px] font-semibold text-slate-600 dark:text-slate-300 truncate">
                        <span className="text-slate-400">或 </span>
                        {nameOf(altId)}
                      </p>
                      <button
                        type="button"
                        aria-label={`移除替代動作 ${nameOf(altId)}`}
                        onClick={() => update(removeDraftAlternative(draft, entry.id, altId))}
                        className="shrink-0 px-1.5 text-xs font-bold text-slate-400 hover:text-rose-600 dark:hover:text-rose-400 cursor-pointer"
                      >
                        ✕
                      </button>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <NumberStepper
                        value={altTarget.sets}
                        onChange={(v) =>
                          update(setDraftTarget(draft, entry.id, altId, { sets: v }, baseSetsFor(altId, entry)))
                        }
                        step={1}
                        min={1}
                        max={20}
                        decimals={0}
                      />
                      <NumberStepper
                        value={altTarget.reps}
                        onChange={(v) =>
                          update(setDraftTarget(draft, entry.id, altId, { reps: v }, baseSetsFor(altId, entry)))
                        }
                        step={1}
                        min={1}
                        max={50}
                        decimals={0}
                      />
                    </div>
                  </div>
                );
              })}
              <button
                type="button"
                onClick={() => setPicker({ mode: 'alt', entryId: entry.id })}
                className="ml-3 text-[10px] font-bold text-indigo-600 dark:text-indigo-400 bg-indigo-50/50 dark:bg-indigo-950/30 px-2 py-1 rounded-lg border border-dashed border-indigo-200 dark:border-indigo-800 cursor-pointer"
              >
                ＋ 替代動作
              </button>
            </div>
          );
        })}
      </div>

      <button
        type="button"
        onClick={() => setPicker({ mode: 'add' })}
        className="w-full py-2 bg-white dark:bg-slate-900 hover:bg-slate-50 dark:hover:bg-slate-800/50 text-slate-600 dark:text-slate-300 text-[11px] font-bold rounded-lg border border-dashed border-slate-300 dark:border-slate-700 transition cursor-pointer"
      >
        ＋ 新增動作
      </button>

      <div className="border-t border-slate-100 dark:border-slate-800 pt-3 space-y-2">
        <button
          type="button"
          disabled={isSaving}
          onClick={() => handleSave('all')}
          className="w-full py-2.5 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white text-xs font-bold rounded-xl transition cursor-pointer"
        >
          套用到全部 8 週
        </button>
        <button
          type="button"
          disabled={isSaving}
          onClick={() => handleSave('week')}
          className="w-full py-2.5 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 disabled:opacity-50 text-slate-700 dark:text-slate-200 text-xs font-bold rounded-xl transition cursor-pointer"
        >
          只改 {weekLabel}
        </button>
        <ul className="text-[10px] text-slate-400 leading-relaxed space-y-0.5 list-disc pl-4">
          <li>全部 8 週：改過的組數次數 8 週都變成一樣，刪掉的動作 8 週都拿掉，新增的 8 週都有。</li>
          <li>只改 {weekLabel}：其他週維持原樣；刪掉的動作只有這週不做。</li>
          <li>換動作、加減替代動作、調順序，兩種都會套用到 8 週。</li>
        </ul>
      </div>

      {picker && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-[60] flex items-end justify-center">
          <div className="fixed inset-0" onClick={() => setPicker(null)} />
          <div className="relative bg-white dark:bg-slate-900 w-full max-w-md rounded-t-2xl shadow-xl z-10 p-5 space-y-4 max-h-[85vh] overflow-y-auto animate-slide-up">
            <div className="flex justify-between items-center border-b border-slate-100 dark:border-slate-800 pb-3">
              <h3 className="font-bold text-slate-800 dark:text-slate-100 text-base">
                {picker.mode === 'add' ? '新增動作' : picker.mode === 'replace' ? '換成別的動作' : '加一個替代動作'}
              </h3>
              <button onClick={() => setPicker(null)} className="text-slate-400 hover:text-slate-600" aria-label="關閉">
                <svg fill="none" viewBox="0 0 24 24" strokeWidth="2.5" stroke="currentColor" className="w-5 h-5">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            {picker.mode === 'alt' && (
              <p className="text-[11px] text-slate-500 dark:text-slate-400">
                器材不同時改做的動作。組數次數先跟主動作一樣，加完可以各自調整；重量各自記。
              </p>
            )}
            <div className="overflow-y-auto max-h-[65vh]">
              <ExerciseList mode="select" onSelect={handlePick} />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
