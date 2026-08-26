import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useProgramStore } from '../store/program';
import { isZongYuanProgramImported, importZongYuanProgram } from '../lib/importZongYuanProgram';
import { getTemplate, saveTemplate } from '../db/templates';
import { listExercises } from '../db/exercises';
import { type Exercise, type WorkoutEntry, type WorkoutTemplate } from '../db/schema';
import ExerciseList from '../components/ExerciseList';
import NumberStepper from '../components/NumberStepper';
import {
  ZONGYUAN_8WEEK_PLAN,
  ZONGYUAN_WEEK_LABELS,
  ZONGYUAN_COACH_CHECK_TABLE,
  ZONGYUAN_PROGRAM_NAME,
} from '../data/zongyuan-8week-program';

type WeekTarget = { sets: number; reps: number; note?: string };

interface LiveExerciseRow {
  entryId: string;
  exerciseId: string;
  name: string;
  weeklyTargets: WeekTarget[];
}

interface LiveDayPlan {
  templateId: string;
  label: string;
  exercises: LiveExerciseRow[];
}

const DEFAULT_WEEK_TARGET: WeekTarget = { sets: 3, reps: 10 };

function getWeekTarget(targets: WeekTarget[], weekIdx: number): WeekTarget {
  if (targets.length === 0) return DEFAULT_WEEK_TARGET;
  return targets[Math.min(weekIdx, targets.length - 1)];
}

export default function ProgramGuide() {
  const navigate = useNavigate();
  const { currentProgram, initProgram } = useProgramStore();
  const [isImported, setIsImported] = useState<boolean | null>(null);
  const [isImporting, setIsImporting] = useState(false);
  // null = 尚未手動選過週次，跟著目前計畫進度自動顯示
  const [manualWeek, setManualWeek] = useState<number | null>(null);

  // ── 已匯入且是目前計畫時，改讀真正在用的範本內容（可編輯）；否則維持唯讀預覽 ──
  const [exerciseMap, setExerciseMap] = useState<Map<string, Exercise>>(new Map());
  const [liveTemplates, setLiveTemplates] = useState<Record<string, WorkoutTemplate>>({});
  const [editingTemplateId, setEditingTemplateId] = useState<string | null>(null);
  const [picker, setPicker] = useState<{ templateId: string; entryId: string | null } | null>(null);

  useEffect(() => {
    initProgram();
    isZongYuanProgramImported().then(setIsImported);
  }, [initProgram]);

  const isActiveHere = currentProgram?.name === ZONGYUAN_PROGRAM_NAME;
  const autoWeek = isActiveHere ? Math.min(8, Math.max(1, currentProgram.cycleCount + 1)) : 1;
  const selectedWeek = manualWeek ?? autoWeek;
  const weekIdx = selectedWeek - 1;

  const showLive = isActiveHere && isImported === true;

  useEffect(() => {
    if (!showLive || !currentProgram) return;
    let cancelled = false;
    (async () => {
      const templateIds = currentProgram.slots.map((s) => s.templateId).filter((id): id is string => !!id);
      const [exercises, templates] = await Promise.all([
        listExercises(),
        Promise.all(templateIds.map((id) => getTemplate(id))),
      ]);
      if (cancelled) return;
      setExerciseMap(new Map(exercises.map((e) => [e.id, e])));
      const map: Record<string, WorkoutTemplate> = {};
      for (const t of templates) if (t) map[t.id] = t;
      setLiveTemplates(map);
    })();
    return () => {
      cancelled = true;
    };
  }, [showLive, currentProgram]);

  const liveDays = useMemo<LiveDayPlan[] | null>(() => {
    if (!showLive || !currentProgram) return null;
    const days: LiveDayPlan[] = [];
    for (const slot of currentProgram.slots) {
      if (!slot.templateId) continue;
      const tpl = liveTemplates[slot.templateId];
      if (!tpl) return null; // 還在載入
      const exercises = [...tpl.entries]
        .sort((a, b) => a.order - b.order)
        .map((entry) => ({
          entryId: entry.id,
          exerciseId: entry.exerciseId,
          name: exerciseMap.get(entry.exerciseId)?.name ?? '未知動作',
          weeklyTargets: entry.weeklyTargets ?? [{ sets: entry.sets.length, reps: entry.sets[0]?.reps ?? 0 }],
        }));
      days.push({ templateId: tpl.id, label: slot.label, exercises });
    }
    return days;
  }, [showLive, currentProgram, liveTemplates, exerciseMap]);

  const handleImport = async () => {
    if (currentProgram && currentProgram.name !== ZONGYUAN_PROGRAM_NAME) {
      const statusLabel = currentProgram.status === 'paused' ? '暫停中' : '進行中';
      const confirmEnd = window.confirm(
        `目前已有${statusLabel}的計畫「${currentProgram.name}」，匯入這份課表將會結束它，確定嗎？`
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

  const persistTemplate = async (updated: WorkoutTemplate) => {
    await saveTemplate(updated);
    setLiveTemplates((prev) => ({ ...prev, [updated.id]: updated }));
  };

  const handleDeleteEntry = async (templateId: string, entryId: string) => {
    const tpl = liveTemplates[templateId];
    if (!tpl) return;
    if (tpl.entries.length <= 1) {
      alert('這天至少要留一個動作');
      return;
    }
    if (!window.confirm('確定要移除這個動作嗎？')) return;
    const entries = [...tpl.entries]
      .sort((a, b) => a.order - b.order)
      .filter((e) => e.id !== entryId)
      .map((e, i) => ({ ...e, order: i }));
    await persistTemplate({ ...tpl, entries });
  };

  const handleMoveEntry = async (templateId: string, entryId: string, direction: 'up' | 'down') => {
    const tpl = liveTemplates[templateId];
    if (!tpl) return;
    const sorted = [...tpl.entries].sort((a, b) => a.order - b.order);
    const index = sorted.findIndex((e) => e.id === entryId);
    const targetIndex = direction === 'up' ? index - 1 : index + 1;
    if (index < 0 || targetIndex < 0 || targetIndex >= sorted.length) return;
    [sorted[index], sorted[targetIndex]] = [sorted[targetIndex], sorted[index]];
    const entries = sorted.map((e, i) => ({ ...e, order: i }));
    await persistTemplate({ ...tpl, entries });
  };

  const handleUpdateWeekTarget = async (
    templateId: string,
    entryId: string,
    weekIndex: number,
    patch: Partial<{ sets: number; reps: number }>
  ) => {
    const tpl = liveTemplates[templateId];
    if (!tpl) return;
    const entries = tpl.entries.map((e) => {
      if (e.id !== entryId) return e;
      const base =
        e.weeklyTargets && e.weeklyTargets.length === 8
          ? e.weeklyTargets
          : Array.from({ length: 8 }, (_, i) => e.weeklyTargets?.[i] ?? { sets: e.sets.length || 3, reps: e.sets[0]?.reps || 10 });
      const targets = [...base];
      const current = targets[weekIndex];
      // 手動調整過的一週，改用單純的組數×次數顯示，不再沿用教練原始備註文字
      targets[weekIndex] = { sets: patch.sets ?? current.sets, reps: patch.reps ?? current.reps };
      return { ...e, weeklyTargets: targets };
    });
    await persistTemplate({ ...tpl, entries });
  };

  const handlePickExercise = async (ex: Exercise) => {
    if (!picker) return;
    const tpl = liveTemplates[picker.templateId];
    if (!tpl) return;
    let entries: WorkoutEntry[];
    if (picker.entryId) {
      entries = tpl.entries.map((e) => (e.id === picker.entryId ? { ...e, exerciseId: ex.id } : e));
    } else {
      const weeklyTargets = Array.from({ length: 8 }, () => ({ ...DEFAULT_WEEK_TARGET }));
      const newEntry: WorkoutEntry = {
        id: crypto.randomUUID(),
        exerciseId: ex.id,
        order: tpl.entries.length,
        sets: Array.from({ length: DEFAULT_WEEK_TARGET.sets }, () => ({
          id: crypto.randomUUID(),
          weight: 0,
          reps: DEFAULT_WEEK_TARGET.reps,
          isWarmup: false,
          completed: false,
          createdAt: Date.now(),
        })),
        weeklyTargets,
      };
      entries = [...tpl.entries, newEntry];
    }
    await persistTemplate({ ...tpl, entries });
    setPicker(null);
  };

  return (
    <div className="p-4 max-w-md mx-auto space-y-6 pb-20">
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
                目前第 {currentProgram.cycleCount + 1} 輪（約第 {Math.min(8, currentProgram.cycleCount + 1)} 週）
                {currentProgram.status === 'paused' && '（已暫停）'}
              </p>
            )}
            {showLive && (
              <p className="text-[11px] text-indigo-500 dark:text-indigo-400 font-semibold">
                💡 下方各天卡片右上角按「編輯」即可調整動作與組數，改動會直接套用到「訓練」頁。
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
        {showLive ? (
          liveDays ? (
            liveDays.map((day) => {
              const isEditing = editingTemplateId === day.templateId;
              const dayTotal = day.exercises.reduce((sum, ex) => sum + getWeekTarget(ex.weeklyTargets, weekIdx).sets, 0);
              return (
                <div
                  key={day.templateId}
                  className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 shadow-sm space-y-3"
                >
                  <div className="flex justify-between items-center gap-2">
                    <h4 className="font-bold text-slate-800 dark:text-slate-200 text-sm">{day.label}</h4>
                    <div className="flex items-center gap-1.5 shrink-0">
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-indigo-50 dark:bg-indigo-950/40 text-indigo-600 dark:text-indigo-400">
                        當週總計 {dayTotal}組
                      </span>
                      <button
                        type="button"
                        onClick={() => setEditingTemplateId(isEditing ? null : day.templateId)}
                        className="text-[10px] font-bold px-2.5 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700 transition cursor-pointer"
                      >
                        {isEditing ? '完成' : '編輯'}
                      </button>
                    </div>
                  </div>
                  <div className="space-y-2">
                    {day.exercises.map((ex, idx) => {
                      const target = getWeekTarget(ex.weeklyTargets, weekIdx);
                      return (
                        <div
                          key={ex.entryId}
                          className="py-1.5 border-b border-slate-50 dark:border-slate-800/60 last:border-0 space-y-1.5"
                        >
                          <div className="flex justify-between items-center gap-2">
                            {isEditing ? (
                              <button
                                type="button"
                                onClick={() => setPicker({ templateId: day.templateId, entryId: ex.entryId })}
                                className="min-w-0 flex-1 text-left text-xs font-semibold text-indigo-600 dark:text-indigo-400 truncate underline decoration-dotted cursor-pointer"
                              >
                                {ex.name}
                              </button>
                            ) : (
                              <p className="min-w-0 flex-1 text-xs font-semibold text-slate-700 dark:text-slate-300 truncate">
                                {ex.name}
                              </p>
                            )}
                            {isEditing ? (
                              <div className="flex items-center gap-0.5 shrink-0">
                                <button
                                  type="button"
                                  onClick={() => handleMoveEntry(day.templateId, ex.entryId, 'up')}
                                  disabled={idx === 0}
                                  className="p-1 text-slate-400 disabled:opacity-30 hover:text-slate-700 dark:hover:text-slate-200 cursor-pointer"
                                >
                                  <svg fill="none" viewBox="0 0 24 24" strokeWidth="3" stroke="currentColor" className="w-3.5 h-3.5">
                                    <path strokeLinecap="round" strokeLinejoin="round" d="m4.5 15.75 7.5-7.5 7.5 7.5" />
                                  </svg>
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleMoveEntry(day.templateId, ex.entryId, 'down')}
                                  disabled={idx === day.exercises.length - 1}
                                  className="p-1 text-slate-400 disabled:opacity-30 hover:text-slate-700 dark:hover:text-slate-200 cursor-pointer"
                                >
                                  <svg fill="none" viewBox="0 0 24 24" strokeWidth="3" stroke="currentColor" className="w-3.5 h-3.5">
                                    <path strokeLinecap="round" strokeLinejoin="round" d="m19.5 8.25-7.5 7.5-7.5-7.5" />
                                  </svg>
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleDeleteEntry(day.templateId, ex.entryId)}
                                  className="p-1 text-slate-400 hover:text-rose-600 dark:hover:text-rose-400 cursor-pointer"
                                >
                                  <svg fill="none" viewBox="0 0 24 24" strokeWidth="2.5" stroke="currentColor" className="w-3.5 h-3.5">
                                    <path strokeLinecap="round" strokeLinejoin="round" d="m14.74 9-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 0 1-2.244 2.077H8.084a2.25 2.25 0 0 1-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 0 0-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 0 1 3.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 0 0-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 0 0-7.5 0" />
                                  </svg>
                                </button>
                              </div>
                            ) : (
                              <span className="shrink-0 text-xs font-bold text-slate-800 dark:text-slate-200 text-right">
                                {target.note ?? `${target.sets}組 × ${target.reps}下`}
                              </span>
                            )}
                          </div>
                          {isEditing && (
                            <div className="grid grid-cols-2 gap-2">
                              <div className="space-y-0.5">
                                <span className="text-[9px] font-bold text-slate-400 block">{ZONGYUAN_WEEK_LABELS[weekIdx]} 組數</span>
                                <NumberStepper
                                  value={target.sets}
                                  onChange={(v) => handleUpdateWeekTarget(day.templateId, ex.entryId, weekIdx, { sets: v })}
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
                                  onChange={(v) => handleUpdateWeekTarget(day.templateId, ex.entryId, weekIdx, { reps: v })}
                                  step={1}
                                  min={1}
                                  max={50}
                                  decimals={0}
                                />
                              </div>
                            </div>
                          )}
                          {isEditing && target.note && (
                            <p className="text-[10px] text-amber-600 dark:text-amber-400">
                              原始教練備註：{target.note}（調整組數/次數後會蓋掉這則備註）
                            </p>
                          )}
                        </div>
                      );
                    })}
                  </div>
                  {isEditing && (
                    <button
                      type="button"
                      onClick={() => setPicker({ templateId: day.templateId, entryId: null })}
                      className="w-full py-2 bg-white dark:bg-slate-900 hover:bg-slate-50 dark:hover:bg-slate-800/50 text-slate-600 dark:text-slate-300 text-[11px] font-bold rounded-lg border border-dashed border-slate-300 dark:border-slate-700 transition cursor-pointer"
                    >
                      ＋ 新增動作
                    </button>
                  )}
                </div>
              );
            })
          ) : (
            <p className="text-xs text-slate-400 text-center py-4">載入課表中...</p>
          )
        ) : (
          ZONGYUAN_8WEEK_PLAN.map((day) => (
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
          ))
        )}
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

      {/* 換動作／新增動作 picker */}
      {picker && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-50 flex items-end justify-center">
          <div className="fixed inset-0" onClick={() => setPicker(null)} />
          <div className="relative bg-white dark:bg-slate-900 w-full max-w-md rounded-t-2xl shadow-xl z-10 p-5 space-y-4 max-h-[85vh] overflow-y-auto animate-slide-up">
            <div className="flex justify-between items-center border-b border-slate-100 dark:border-slate-800 pb-3">
              <h3 className="font-bold text-slate-800 dark:text-slate-100 text-base">
                {picker.entryId ? '換成別的動作' : '新增動作'}
              </h3>
              <button onClick={() => setPicker(null)} className="text-slate-400 hover:text-slate-600">
                <svg fill="none" viewBox="0 0 24 24" strokeWidth="2.5" stroke="currentColor" className="w-5 h-5">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <div className="overflow-y-auto max-h-[65vh]">
              <ExerciseList mode="select" onSelect={handlePickExercise} />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
