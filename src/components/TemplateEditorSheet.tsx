import { useEffect, useMemo, useState } from 'react';
import {
  type Exercise,
  type SetLog,
  type TemplateCategory,
  type Unit,
  type Workout,
  type WorkoutEntry,
  type WorkoutTemplate,
} from '../db/schema';
import { saveTemplate } from '../db/templates';
import { listCompletedWorkouts } from '../db/workouts';
import { ASSISTED_EXERCISE_NAMES } from '../data/seed-exercises';
import { TEMPLATE_CATEGORIES, getTemplateCategory } from '../lib/splitRotation';
import { formatWeight, toKgFromDisplay, weightStep } from '../lib/units';
import { getExerciseSessions } from '../lib/exerciseSessions';
import {
  addAlternativeToEntry,
  clonePlannedSets,
  hasStoredCandidateSets,
  removeAlternativeFromEntry,
  replaceEntryExercise,
  selectEntryExercise,
} from '../lib/workoutEntries';
import ExerciseList from './ExerciseList';
import NumberStepper from './NumberStepper';
import SheetHeader from './SheetHeader';

interface TemplateEditorSheetProps {
  /** 要編輯的範本；新增時傳 createBlankTemplate() 的結果 */
  template: WorkoutTemplate;
  isNew: boolean;
  exerciseMap: Map<string, Exercise>;
  locations: string[];
  unit: Unit;
  onClose: () => void;
  onSaved: (template: WorkoutTemplate) => void;
}

type PickerTarget =
  | { mode: 'add' }
  | { mode: 'replace'; entryId: string }
  | { mode: 'alt'; entryId: string };

const NEW_STRENGTH_SETS = 3;
const NEW_STRENGTH_REPS = 10;
const NEW_CARDIO_SECONDS = 30 * 60;

function newSet(fields: Partial<SetLog>): SetLog {
  return {
    id: crypto.randomUUID(),
    weight: 0,
    reps: 0,
    isWarmup: false,
    completed: false,
    createdAt: Date.now(),
    ...fields,
  };
}

/**
 * 範本編輯器（全屏）：手動建空白範本、或改既有範本的名稱／分類／地點／動作／每組重量次數／替代動作。
 * z-[60]：要蓋過底部導覽列（z-50），不然最下面的「儲存」會被擋住。
 */
export default function TemplateEditorSheet({
  template,
  isNew,
  exerciseMap,
  locations,
  unit,
  onClose,
  onSaved,
}: TemplateEditorSheetProps) {
  const [name, setName] = useState(template.name);
  // null ＝ 不手動指定，依名稱自動判斷
  const [category, setCategory] = useState<TemplateCategory | null>(template.category ?? null);
  const [location, setLocation] = useState(template.location ?? '');
  const [entries, setEntries] = useState<WorkoutEntry[]>(() =>
    [...template.entries].sort((a, b) => a.order - b.order)
  );
  const [picker, setPicker] = useState<PickerTarget | null>(null);
  const [isDirty, setIsDirty] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // 選動作時可能選到剛在清單裡新增的自訂動作，外面傳進來的 map 還沒有，另外記著
  const [pickedExercises, setPickedExercises] = useState<Map<string, Exercise>>(new Map());
  // 切到沒存過數字的替代動作時，用上次實際做的紀錄當預設
  const [completedWorkouts, setCompletedWorkouts] = useState<Workout[]>([]);

  useEffect(() => {
    let active = true;
    listCompletedWorkouts()
      .then((list) => {
        if (active) setCompletedWorkouts(list);
      })
      .catch((err) => console.error('Failed to load completed workouts:', err));
    return () => {
      active = false;
    };
  }, []);

  const findExercise = (id: string) => pickedExercises.get(id) ?? exerciseMap.get(id);

  const autoCategory = useMemo(() => getTemplateCategory({ name: name.trim() || template.name }), [name, template.name]);

  const updateEntries = (next: WorkoutEntry[]) => {
    setEntries(next.map((e, i) => ({ ...e, order: i })));
    setIsDirty(true);
  };

  const updateEntry = (entryId: string, patch: (entry: WorkoutEntry) => WorkoutEntry) => {
    updateEntries(entries.map((e) => (e.id === entryId ? patch(e) : e)));
  };

  const updateSetField = (entryId: string, setId: string, fields: Partial<SetLog>) => {
    updateEntry(entryId, (e) => ({
      ...e,
      sets: e.sets.map((s) => (s.id === setId ? { ...s, ...fields } : s)),
    }));
  };

  const addSet = (entryId: string) => {
    updateEntry(entryId, (e) => {
      const last = e.sets[e.sets.length - 1];
      const copy = last ? clonePlannedSets([last])[0] : newSet({ reps: NEW_STRENGTH_REPS });
      return { ...e, sets: [...e.sets, { ...copy, isWarmup: false }] };
    });
  };

  const removeSet = (entryId: string, setId: string) => {
    updateEntry(entryId, (e) => ({ ...e, sets: e.sets.filter((s) => s.id !== setId) }));
  };

  const moveEntry = (index: number, direction: -1 | 1) => {
    const target = index + direction;
    if (target < 0 || target >= entries.length) return;
    const next = [...entries];
    [next[index], next[target]] = [next[target], next[index]];
    updateEntries(next);
  };

  const removeEntry = (entryId: string) => {
    updateEntries(entries.filter((e) => e.id !== entryId));
  };

  const selectAlternative = (entry: WorkoutEntry, exerciseId: string) => {
    let fallback: SetLog[] | undefined;
    if (!hasStoredCandidateSets(entry, exerciseId)) {
      const last = getExerciseSessions(completedWorkouts, exerciseId)[0];
      if (last) fallback = clonePlannedSets(last.sets);
    }
    updateEntries(selectEntryExercise(entries, entry.id, exerciseId, fallback));
  };

  const handlePick = (exercise: Exercise) => {
    if (!picker) return;
    setPickedExercises((prev) => new Map(prev).set(exercise.id, exercise));
    const isCardio = exercise.muscleGroup === '有氧';

    if (picker.mode === 'add') {
      const sets = isCardio
        ? [newSet({ durationSeconds: NEW_CARDIO_SECONDS, distanceKm: 0, calories: 0 })]
        : Array.from({ length: NEW_STRENGTH_SETS }, () => newSet({ reps: NEW_STRENGTH_REPS }));
      updateEntries([...entries, { id: crypto.randomUUID(), exerciseId: exercise.id, order: entries.length, sets }]);
    } else if (picker.mode === 'replace') {
      updateEntries(replaceEntryExercise(entries, picker.entryId, exercise.id));
    } else {
      if (isCardio) {
        alert('替代動作暫不支援有氧');
        setPicker(null);
        return;
      }
      updateEntries(addAlternativeToEntry(entries, picker.entryId, exercise.id));
    }
    setPicker(null);
  };

  const handleClose = () => {
    if (isDirty && !window.confirm('還沒儲存，確定要離開嗎？')) return;
    onClose();
  };

  const handleSave = async () => {
    const trimmed = name.trim();
    if (!trimmed) {
      setError('請輸入範本名稱');
      return;
    }
    const saved: WorkoutTemplate = {
      ...template,
      name: trimmed,
      category: category ?? undefined,
      location: location || undefined,
      entries: entries.map((e, i) => ({ ...e, order: i })),
    };
    // 沒指定分類時整個鍵拿掉，維持「依名稱自動判斷」
    if (!category) delete saved.category;
    if (!location) delete saved.location;
    setIsSaving(true);
    try {
      await saveTemplate(saved);
      onSaved(saved);
    } catch (err) {
      console.error(err);
      setError('儲存失敗，請再試一次');
      setIsSaving(false);
    }
  };

  const chipClass = (selected: boolean) =>
    `px-2.5 py-1.5 rounded-lg text-[11px] font-bold border transition cursor-pointer ${
      selected
        ? 'bg-indigo-600 border-indigo-600 text-white'
        : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:border-indigo-300'
    }`;

  return (
    <div className="fixed inset-0 bg-white dark:bg-slate-950 z-[60] flex flex-col">
      <SheetHeader
        title={isNew ? '新增範本' : '編輯範本'}
        subtitle={isNew ? '從空白開始，加入動作和每組重量次數' : template.name}
        onBack={handleClose}
      />

      <div className="flex-1 overflow-y-auto">
        <div className="max-w-md mx-auto w-full px-4 py-4 space-y-5">
          {/* 基本資料 */}
          <div className="space-y-3">
            <label className="block space-y-1">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">範本名稱</span>
              <input
                type="text"
                value={name}
                onChange={(e) => {
                  setName(e.target.value);
                  setIsDirty(true);
                  setError(null);
                }}
                placeholder="例如：拉 (Pull) 家裡版"
                className="w-full border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2.5 text-sm font-bold bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-100 focus:outline-none focus:border-indigo-500"
              />
            </label>

            <div className="space-y-1">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">分類</span>
              <div className="flex flex-wrap gap-1.5">
                <button
                  type="button"
                  onClick={() => {
                    setCategory(null);
                    setIsDirty(true);
                  }}
                  className={chipClass(category === null)}
                >
                  自動（{autoCategory}）
                </button>
                {TEMPLATE_CATEGORIES.map((cat) => (
                  <button
                    key={cat}
                    type="button"
                    onClick={() => {
                      setCategory(cat);
                      setIsDirty(true);
                    }}
                    className={chipClass(category === cat)}
                  >
                    {cat}
                  </button>
                ))}
              </div>
            </div>

            {locations.length > 0 && (
              <label className="block space-y-1">
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">地點</span>
                <select
                  value={location}
                  onChange={(e) => {
                    setLocation(e.target.value);
                    setIsDirty(true);
                  }}
                  className="w-full border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2.5 text-sm font-bold bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-100 focus:outline-none focus:border-indigo-500"
                >
                  <option value="">(無地點)</option>
                  {/* 範本原本的地點若已不在設定清單裡，也要留著讓它顯示得出來 */}
                  {[...new Set([...locations, ...(template.location ? [template.location] : [])])].map((loc) => (
                    <option key={loc} value={loc}>
                      {loc}
                    </option>
                  ))}
                </select>
              </label>
            )}
          </div>

          {/* 動作清單 */}
          <div className="space-y-3">
            <h4 className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
              動作（{entries.length}）
            </h4>

            {entries.length === 0 && (
              <p className="text-xs text-slate-400 text-center py-6 bg-slate-50 dark:bg-slate-900 rounded-2xl">
                還沒有動作，按下方「＋ 新增動作」開始加。
              </p>
            )}

            {entries.map((entry, index) => {
              const exercise = findExercise(entry.exerciseId);
              const isCardio = exercise?.muscleGroup === '有氧';
              const isAssisted = !!exercise && ASSISTED_EXERCISE_NAMES.has(exercise.name);
              const hasAlternatives = !!entry.candidateExerciseIds && entry.candidateExerciseIds.length > 1;
              return (
                <div
                  key={entry.id}
                  className="border border-slate-200 dark:border-slate-800 rounded-2xl overflow-hidden bg-white dark:bg-slate-900 shadow-sm"
                >
                  {/* 標頭：動作名稱（點了可換）＋ 排序／刪除 */}
                  <div className="bg-slate-50 dark:bg-slate-800/40 px-3 py-2.5 flex items-center gap-2 border-b border-slate-100 dark:border-slate-800">
                    <button
                      type="button"
                      onClick={() => setPicker({ mode: 'replace', entryId: entry.id })}
                      className="flex-1 min-w-0 text-left space-y-0.5 cursor-pointer"
                      title="換成別的動作"
                    >
                      <span className={`block text-sm font-bold truncate underline decoration-dotted ${
                        exercise ? 'text-slate-800 dark:text-slate-100' : 'text-amber-600 dark:text-amber-500'
                      }`}>
                        {exercise ? exercise.name : '⚠ 已刪除的動作（點我換）'}
                      </span>
                      {exercise && (
                        <span className="block text-[10px] font-bold text-slate-400">
                          {exercise.muscleGroup} / {exercise.equipment}
                        </span>
                      )}
                    </button>
                    <div className="flex items-center gap-0.5 shrink-0">
                      <button
                        type="button"
                        onClick={() => moveEntry(index, -1)}
                        disabled={index === 0}
                        aria-label="上移"
                        className="p-1.5 text-slate-400 disabled:opacity-30 hover:text-slate-700 dark:hover:text-slate-200 cursor-pointer"
                      >
                        <svg fill="none" viewBox="0 0 24 24" strokeWidth="3" stroke="currentColor" className="w-3.5 h-3.5">
                          <path strokeLinecap="round" strokeLinejoin="round" d="m4.5 15.75 7.5-7.5 7.5 7.5" />
                        </svg>
                      </button>
                      <button
                        type="button"
                        onClick={() => moveEntry(index, 1)}
                        disabled={index === entries.length - 1}
                        aria-label="下移"
                        className="p-1.5 text-slate-400 disabled:opacity-30 hover:text-slate-700 dark:hover:text-slate-200 cursor-pointer"
                      >
                        <svg fill="none" viewBox="0 0 24 24" strokeWidth="3" stroke="currentColor" className="w-3.5 h-3.5">
                          <path strokeLinecap="round" strokeLinejoin="round" d="m19.5 8.25-7.5 7.5-7.5-7.5" />
                        </svg>
                      </button>
                      <button
                        type="button"
                        onClick={() => removeEntry(entry.id)}
                        className="ml-1 px-2 py-1 text-[10px] font-bold text-rose-600 dark:text-rose-400 bg-rose-50 dark:bg-rose-950/30 rounded-lg cursor-pointer"
                      >
                        移除
                      </button>
                    </div>
                  </div>

                  <div className="p-3 space-y-3">
                    {/* 替代動作：每個替代動作有自己的組數/重量 */}
                    {!isCardio && (
                      <div className="flex flex-wrap items-center gap-1.5">
                        {hasAlternatives &&
                          entry.candidateExerciseIds!.map((candId) => {
                            const cand = findExercise(candId);
                            const isCurrent = candId === entry.exerciseId;
                            return (
                              <div
                                key={candId}
                                className={`flex items-center rounded-lg text-[11px] ${
                                  isCurrent
                                    ? 'bg-indigo-600 text-white font-bold'
                                    : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400'
                                }`}
                              >
                                <button
                                  type="button"
                                  onClick={() => selectAlternative(entry, candId)}
                                  className="px-2.5 py-1.5 font-semibold cursor-pointer"
                                >
                                  {cand ? cand.name : '⚠ 未知動作'}
                                </button>
                                {!isCurrent && (
                                  <button
                                    type="button"
                                    onClick={() => updateEntries(removeAlternativeFromEntry(entries, entry.id, candId))}
                                    className="pr-2 pl-0.5 py-1.5 hover:text-rose-500 font-bold text-[10px] cursor-pointer"
                                    title="移除此替代"
                                  >
                                    ✕
                                  </button>
                                )}
                              </div>
                            );
                          })}
                        <button
                          type="button"
                          onClick={() => setPicker({ mode: 'alt', entryId: entry.id })}
                          className="text-[11px] font-bold text-indigo-600 dark:text-indigo-400 bg-indigo-50/50 dark:bg-indigo-950/30 px-2.5 py-1.5 rounded-lg border border-dashed border-indigo-200 dark:border-indigo-800 cursor-pointer"
                        >
                          ＋ 替代
                        </button>
                      </div>
                    )}
                    {hasAlternatives && (
                      <p className="text-[10px] text-slate-400 font-semibold">
                        點上面的動作切換；下面的組數重量是目前選中那個自己的。
                      </p>
                    )}

                    {entry.weeklyTargets && entry.weeklyTargets.length > 0 && (
                      <p className="text-[10px] text-amber-600 dark:text-amber-400 font-semibold">
                        這個動作在課表裡依週次安排組數／次數（到「課表」頁調整），這裡的重量是起始重量。
                      </p>
                    )}

                    {/* 每一組 */}
                    <div className="space-y-2">
                      {entry.sets.map((setLog, setIdx) =>
                        isCardio ? (
                          <div key={setLog.id} className="flex items-end gap-2">
                            <span className="w-7 h-9 flex items-center justify-center text-xs font-bold text-slate-400 shrink-0">
                              {setIdx + 1}
                            </span>
                            <div className="flex-1 min-w-0">
                              <span className="block text-center text-[10px] font-bold text-slate-400 mb-0.5">時長 (分)</span>
                              <NumberStepper
                                value={Math.round((setLog.durationSeconds ?? 0) / 60)}
                                onChange={(v) => updateSetField(entry.id, setLog.id, { durationSeconds: v * 60 })}
                                step={1}
                                min={0}
                                decimals={0}
                              />
                            </div>
                            <div className="flex-1 min-w-0">
                              <span className="block text-center text-[10px] font-bold text-slate-400 mb-0.5">距離 (km)</span>
                              <NumberStepper
                                value={setLog.distanceKm ?? 0}
                                onChange={(v) => updateSetField(entry.id, setLog.id, { distanceKm: v })}
                                step={0.5}
                                min={0}
                                decimals={1}
                              />
                            </div>
                            <button
                              type="button"
                              onClick={() => removeSet(entry.id, setLog.id)}
                              aria-label="刪除這組"
                              className="h-9 px-1.5 text-slate-400 hover:text-rose-500 font-bold text-xs cursor-pointer"
                            >
                              ✕
                            </button>
                          </div>
                        ) : (
                          <div
                            key={setLog.id}
                            className="rounded-xl border border-slate-100 dark:border-slate-800 bg-slate-50/40 dark:bg-slate-800/20 p-2 space-y-1.5"
                          >
                            <div className="flex items-end gap-2">
                              <span className="w-7 h-9 flex items-center justify-center text-xs font-bold text-slate-400 shrink-0">
                                {setIdx + 1}
                              </span>
                              <div className="flex-1 min-w-0">
                                <span className="block text-center text-[10px] font-bold text-slate-400 mb-0.5">重量 ({unit})</span>
                                <NumberStepper
                                  value={formatWeight(setLog.weight, unit)}
                                  onChange={(v) => updateSetField(entry.id, setLog.id, { weight: toKgFromDisplay(v, unit) })}
                                  step={weightStep(unit)}
                                  min={0}
                                  decimals={1}
                                />
                              </div>
                              <div className="flex-1 min-w-0">
                                <span className="block text-center text-[10px] font-bold text-slate-400 mb-0.5">次數</span>
                                <NumberStepper
                                  value={setLog.reps}
                                  onChange={(v) => updateSetField(entry.id, setLog.id, { reps: v })}
                                  step={1}
                                  min={0}
                                  decimals={0}
                                />
                              </div>
                              <button
                                type="button"
                                onClick={() => removeSet(entry.id, setLog.id)}
                                aria-label="刪除這組"
                                className="h-9 px-1.5 text-slate-400 hover:text-rose-500 font-bold text-xs cursor-pointer"
                              >
                                ✕
                              </button>
                            </div>
                            <div className="flex items-center gap-2 pl-9">
                              <button
                                type="button"
                                onClick={() => updateSetField(entry.id, setLog.id, { isWarmup: !setLog.isWarmup })}
                                className={`px-2.5 py-1 rounded-md text-[10px] font-extrabold shrink-0 cursor-pointer ${
                                  setLog.isWarmup
                                    ? 'bg-amber-100 dark:bg-amber-950/40 text-amber-700 dark:text-amber-400 border border-amber-200 dark:border-amber-900/30'
                                    : 'bg-indigo-50 dark:bg-indigo-950/20 text-indigo-700 dark:text-indigo-400 border border-indigo-100 dark:border-indigo-900/30'
                                }`}
                              >
                                {setLog.isWarmup ? '暖身組' : '正式組'}
                              </button>
                              {isAssisted && (
                                <>
                                  <span className="text-[10px] font-bold text-slate-400 whitespace-nowrap">輔助 ({unit})</span>
                                  <div className="flex-1 min-w-0">
                                    <NumberStepper
                                      value={formatWeight(setLog.assistWeight ?? 0, unit)}
                                      onChange={(v) =>
                                        updateSetField(entry.id, setLog.id, {
                                          assistWeight: v > 0 ? toKgFromDisplay(v, unit) : undefined,
                                        })
                                      }
                                      step={weightStep(unit)}
                                      min={0}
                                      decimals={1}
                                    />
                                  </div>
                                </>
                              )}
                            </div>
                          </div>
                        )
                      )}
                    </div>

                    <button
                      type="button"
                      onClick={() => addSet(entry.id)}
                      className="w-full py-2 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 text-xs font-bold rounded-xl cursor-pointer"
                    >
                      ＋ 加一組
                    </button>
                  </div>
                </div>
              );
            })}

            <button
              type="button"
              onClick={() => setPicker({ mode: 'add' })}
              className="w-full py-3 bg-indigo-50 dark:bg-indigo-950/20 hover:bg-indigo-100 dark:hover:bg-indigo-900/40 text-indigo-700 dark:text-indigo-400 font-bold rounded-2xl border border-dashed border-indigo-200 dark:border-indigo-800 text-sm cursor-pointer"
            >
              ＋ 新增動作
            </button>
          </div>
        </div>
      </div>

      <div className="border-t border-slate-100 dark:border-slate-800 shrink-0">
        <div className="max-w-md mx-auto w-full px-4 py-3 space-y-2">
          {error && <p className="text-xs font-bold text-rose-600 dark:text-rose-400 text-center">{error}</p>}
          <div className="flex gap-2">
            <button
              type="button"
              onClick={handleClose}
              className="flex-1 py-3 bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 font-bold rounded-xl text-sm cursor-pointer"
            >
              取消
            </button>
            <button
              type="button"
              onClick={handleSave}
              disabled={isSaving}
              className="flex-[2] py-3 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white font-bold rounded-xl text-sm shadow-md cursor-pointer"
            >
              {isSaving ? '儲存中...' : '儲存範本'}
            </button>
          </div>
        </div>
      </div>

      {/* 選動作（新增／換掉／加替代） */}
      {picker && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-[70] flex items-end justify-center">
          <div className="fixed inset-0" onClick={() => setPicker(null)} />
          <div className="relative bg-white dark:bg-slate-900 w-full max-w-md rounded-t-2xl shadow-xl z-10 p-5 space-y-4 max-h-[85vh] overflow-y-auto animate-slide-up">
            <div className="flex justify-between items-center border-b border-slate-100 dark:border-slate-800 pb-3">
              <h3 className="font-bold text-slate-800 dark:text-slate-100 text-base">
                {picker.mode === 'add' ? '新增動作' : picker.mode === 'replace' ? '換成別的動作' : '加入替代動作'}
              </h3>
              <button type="button" onClick={() => setPicker(null)} className="text-slate-400 hover:text-slate-600 cursor-pointer" aria-label="關閉">
                <svg fill="none" viewBox="0 0 24 24" strokeWidth="2.5" stroke="currentColor" className="w-5 h-5">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <div className="overflow-y-auto max-h-[65vh]">
              <ExerciseList mode="select" onSelect={handlePick} />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
