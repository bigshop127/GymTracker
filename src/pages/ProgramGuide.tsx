import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useProgramStore } from '../store/program';
import { isZongYuanProgramImported, importZongYuanProgram } from '../lib/importZongYuanProgram';
import {
  createBlankTemplate,
  getTemplateIncludingDeleted,
  listTemplates,
  restoreTemplate,
  saveTemplate,
} from '../db/templates';
import { listExercises } from '../db/exercises';
import { type Exercise, type WorkoutTemplate } from '../db/schema';
import { isCardioTemplate } from '../lib/cardioTemplates';
import { getTemplateCategory, normalizeSplit } from '../lib/splitRotation';
import { buildBlankTemplateFromProgramDay, isSkippedInWeek, PROGRAM_WEEK_COUNT, weekIdxForCycle, weekTargetOf } from '../lib/programWeeks';
import ProgramDayEditCard from '../components/ProgramDayEditCard';
import LapHistorySection from '../components/LapHistorySection';
import {
  ZONGYUAN_8WEEK_PLAN,
  ZONGYUAN_WEEK_LABELS,
  ZONGYUAN_COACH_CHECK_TABLE,
  ZONGYUAN_PROGRAM_NAME,
} from '../data/zongyuan-8week-program';

interface LiveDayPlan {
  kind: 'live';
  slotId: string;
  label: string;
  template: WorkoutTemplate;
}

/** 課表這天指到的範本找不到（被刪了／從來沒有）：不能擋住整頁，單獨這天顯示修復選項 */
interface MissingDayPlan {
  kind: 'missing';
  slotId: string;
  label: string;
  /** 範本還有軟刪除墓碑時才有值，可以一鍵復原 */
  deletedTemplate?: WorkoutTemplate;
}

type DayPlan = LiveDayPlan | MissingDayPlan;

/** 「用這週內容產生空白範本」的選單 */
interface GenerateSheetState {
  /** 勾選要產生的天（slotId） */
  selected: string[];
  /** 我的範本裡已經有的名稱（同名會提醒） */
  existingNames: string[];
  /** 產生完成後的範本名稱 */
  created?: string[];
}

/** 課表這天這週要做的動作（跳過的不算），照順序 */
function plannedEntriesOf(template: WorkoutTemplate, weekIdx: number) {
  return [...template.entries].sort((a, b) => a.order - b.order).filter((e) => !isSkippedInWeek(e, weekIdx));
}

export default function ProgramGuide() {
  const navigate = useNavigate();
  const { currentProgram, initProgram, updateProgram } = useProgramStore();
  const [isImported, setIsImported] = useState<boolean | null>(null);
  const [isImporting, setIsImporting] = useState(false);
  // null = 尚未手動選過週次，跟著目前計畫進度自動顯示
  const [manualWeek, setManualWeek] = useState<number | null>(null);
  const [view, setView] = useState<'plan' | 'laps'>('plan');

  // ── 已匯入且是目前計畫時，改讀真正在用的範本內容（可編輯）；否則維持唯讀預覽 ──
  const [exerciseMap, setExerciseMap] = useState<Map<string, Exercise>>(new Map());
  const [liveTemplates, setLiveTemplates] = useState<Record<string, WorkoutTemplate>>({});
  const [deletedTemplates, setDeletedTemplates] = useState<Record<string, WorkoutTemplate>>({});
  const [isLiveLoaded, setIsLiveLoaded] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  // 正在編輯的那天（slot id）；編輯中週次固定，不能切換
  const [editingSlotId, setEditingSlotId] = useState<string | null>(null);
  const [generateSheet, setGenerateSheet] = useState<GenerateSheetState | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  // 範本找不到的那天：「改用其他範本」的選單
  const [slotPicker, setSlotPicker] = useState<{ slotId: string; label: string; templates: WorkoutTemplate[] } | null>(null);

  useEffect(() => {
    initProgram();
    isZongYuanProgramImported().then(setIsImported);
  }, [initProgram]);

  const isActiveHere = currentProgram?.name === ZONGYUAN_PROGRAM_NAME;
  const currentLap = isActiveHere ? currentProgram.cycleCount + 1 : 1;
  // 第 1~8 輪對 W1~W8，第 9 輪起固定 W7
  const autoWeek = weekIdxForCycle(currentLap) + 1;
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
        Promise.all(templateIds.map((id) => getTemplateIncludingDeleted(id))),
      ]);
      if (cancelled) return;
      setExerciseMap(new Map(exercises.map((e) => [e.id, e])));
      const live: Record<string, WorkoutTemplate> = {};
      const deleted: Record<string, WorkoutTemplate> = {};
      for (const t of templates) {
        if (!t) continue;
        if (t.deletedAt) deleted[t.id] = t;
        else live[t.id] = t;
      }
      setLiveTemplates(live);
      setDeletedTemplates(deleted);
      setIsLiveLoaded(true);
    })();
    return () => {
      cancelled = true;
    };
  }, [showLive, currentProgram, reloadKey]);

  const liveDays = useMemo<DayPlan[] | null>(() => {
    if (!showLive || !currentProgram || !isLiveLoaded) return null;
    const days: DayPlan[] = [];
    for (const slot of currentProgram.slots) {
      const tpl = slot.templateId ? liveTemplates[slot.templateId] : undefined;
      if (!tpl) {
        days.push({
          kind: 'missing',
          slotId: slot.id,
          label: slot.label,
          deletedTemplate: slot.templateId ? deletedTemplates[slot.templateId] : undefined,
        });
        continue;
      }
      days.push({ kind: 'live', slotId: slot.id, label: slot.label, template: tpl });
    }
    return days;
  }, [showLive, currentProgram, isLiveLoaded, liveTemplates, deletedTemplates]);

  const nameOf = (id: string) => exerciseMap.get(id)?.name ?? '未知動作';
  const weekLabel = ZONGYUAN_WEEK_LABELS[weekIdx] ?? `W${selectedWeek}`;
  const liveDayPlans = (liveDays ?? []).filter((d): d is LiveDayPlan => d.kind === 'live');
  const generatedName = (label: string) => `${label}・${weekLabel}`;

  // 編輯時把週次釘住：計畫進度（自動週次）在編輯中變了也不會換週
  const startEditing = (slotId: string) => {
    setManualWeek(selectedWeek);
    setEditingSlotId(slotId);
  };

  const linkSlotToTemplate = async (slotId: string, templateId: string) => {
    if (!currentProgram) return;
    await updateProgram({
      slots: currentProgram.slots.map((s) => (s.id === slotId ? { ...s, templateId } : s)),
    });
  };

  const handleRestoreSlotTemplate = async (templateId: string) => {
    await restoreTemplate(templateId);
    setReloadKey((k) => k + 1);
  };

  const handleOpenSlotPicker = async (slotId: string, label: string) => {
    const templates = (await listTemplates()).filter((t) => !isCardioTemplate(t, exerciseMap));
    setSlotPicker({ slotId, label, templates });
  };

  const handlePickSlotTemplate = async (templateId: string) => {
    if (!slotPicker) return;
    await linkSlotToTemplate(slotPicker.slotId, templateId);
    setSlotPicker(null);
  };

  const handleCreateBlankForSlot = async (slotId: string, label: string) => {
    const template = createBlankTemplate(label, normalizeSplit(label) ?? undefined);
    await saveTemplate(template);
    await linkSlotToTemplate(slotId, template.id);
    // 直接打開這天的編輯模式，好接著加動作
    startEditing(slotId);
  };

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

  const handleSaveDay = async (updated: WorkoutTemplate) => {
    await persistTemplate(updated);
    setEditingSlotId(null);
  };

  const handleOpenGenerate = async () => {
    const templates = await listTemplates();
    setGenerateSheet({
      selected: liveDayPlans.filter((d) => plannedEntriesOf(d.template, weekIdx).length > 0).map((d) => d.slotId),
      existingNames: templates.map((t) => t.name),
    });
  };

  const toggleGenerateDay = (slotId: string) => {
    setGenerateSheet((prev) =>
      prev
        ? {
            ...prev,
            selected: prev.selected.includes(slotId)
              ? prev.selected.filter((id) => id !== slotId)
              : [...prev.selected, slotId],
          }
        : prev
    );
  };

  const handleGenerate = async () => {
    if (!generateSheet) return;
    setIsGenerating(true);
    try {
      const created: string[] = [];
      // createdAt 依課表天數錯開一點，「我的範本」的排序才會跟課表一樣
      const now = Date.now();
      const days = liveDayPlans.filter((d) => generateSheet.selected.includes(d.slotId));
      for (const [i, day] of days.entries()) {
        const name = generatedName(day.label);
        await saveTemplate(buildBlankTemplateFromProgramDay(day.template, weekIdx, name, now + i));
        created.push(name);
      }
      setGenerateSheet({ ...generateSheet, created });
    } catch (err) {
      console.error('Failed to generate templates from program:', err);
      alert('產生範本失敗，請稍後再試。');
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <div className="p-4 max-w-md mx-auto space-y-6 pb-20">
      <div className="space-y-1.5">
        <h2 className="text-lg font-bold text-slate-800 dark:text-slate-200">{ZONGYUAN_PROGRAM_NAME}</h2>
        <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
          W1~W8 組數與次數依週漸進（W4 減量週、W8 測試/收尾週），第 9 輪起不限週數、固定用 W7 的組數一直練下去。班表輪替 推→拉→手，腿日自行安排。
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
                目前第 {currentLap} 輪（用 W{autoWeek} 的組數）
                {currentProgram.status === 'paused' && '（已暫停）'}
              </p>
            )}
            {showLive && (
              <p className="text-[11px] text-indigo-500 dark:text-indigo-400 font-semibold">
                💡 各天卡片右上角按「編輯」可以調整動作、組數和替代動作，儲存時選「套用到全部 8 週」或「只改這週」，會直接套用到「訓練」頁。
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

      {/* 課表內容／每輪紀錄 切換 */}
      {showLive && (
        <div className="grid grid-cols-2 gap-1 p-1 bg-slate-100 dark:bg-slate-800/60 rounded-xl">
          {([['plan', '課表內容'], ['laps', '每輪紀錄']] as const).map(([key, label]) => (
            <button
              key={key}
              type="button"
              onClick={() => setView(key)}
              disabled={!!editingSlotId}
              className={`py-2 rounded-lg text-xs font-bold transition cursor-pointer disabled:cursor-not-allowed ${
                view === key
                  ? 'bg-white dark:bg-slate-900 text-indigo-600 dark:text-indigo-400 shadow-sm'
                  : 'text-slate-500 dark:text-slate-400'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      )}

      {showLive && view === 'laps' && currentProgram && (
        <LapHistorySection program={currentProgram} exerciseMap={exerciseMap} showWeek />
      )}

      {(!showLive || view === 'plan') && (
        <>
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
                  disabled={!!editingSlotId && !isSelected}
                  className={`shrink-0 px-3 py-2 rounded-xl text-xs font-bold transition cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed ${
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
          {editingSlotId && (
            <p className="text-[10px] text-slate-400 font-semibold">編輯中不能切換週次，先儲存或取消。</p>
          )}
          {isActiveHere && currentLap > PROGRAM_WEEK_COUNT && (
            <p className="text-[10px] text-slate-400 font-semibold">
              目前第 {currentLap} 輪：第 {PROGRAM_WEEK_COUNT + 1} 輪起固定用 W{autoWeek} 的組數，要調整就在 W{autoWeek} 按「編輯」。
            </p>
          )}
        </div>

        {/* 用這週的內容產生空白範本 */}
        {showLive && liveDayPlans.length > 0 && (
          <button
            type="button"
            onClick={handleOpenGenerate}
            disabled={!!editingSlotId}
            className="w-full py-2.5 bg-white dark:bg-slate-900 hover:bg-indigo-50 dark:hover:bg-indigo-950/30 disabled:opacity-40 text-indigo-600 dark:text-indigo-400 text-xs font-bold rounded-xl border border-indigo-200 dark:border-indigo-800 transition cursor-pointer"
          >
            📋 用 {weekLabel} 的內容產生空白範本
          </button>
        )}

        {/* 4 天課表卡片 */}
        <div className="space-y-4">
          {showLive ? (
            liveDays ? (
              liveDays.map((day) => {
                if (day.kind === 'missing') {
                  return (
                    <div
                      key={day.slotId}
                      className="bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-900 rounded-2xl p-4 shadow-sm space-y-3"
                    >
                      <div className="flex justify-between items-center gap-2">
                        <h4 className="font-bold text-slate-800 dark:text-slate-200 text-sm">{day.label}</h4>
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-100 dark:bg-amber-900/50 text-amber-700 dark:text-amber-300">
                          ⚠ 找不到範本
                        </span>
                      </div>
                      <p className="text-xs text-amber-800 dark:text-amber-300 leading-relaxed">
                        {day.deletedTemplate
                          ? `這天用的範本「${day.deletedTemplate.name}」已經被刪除了，現在輪到這天開始訓練會是空白的。`
                          : '這天還沒有接上範本，現在輪到這天開始訓練會是空白的。'}
                      </p>
                      <div className="grid grid-cols-1 gap-2">
                        {day.deletedTemplate && (
                          <button
                            type="button"
                            onClick={() => handleRestoreSlotTemplate(day.deletedTemplate!.id)}
                            className="w-full py-2.5 bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold rounded-xl transition cursor-pointer"
                          >
                            復原原本的範本（{day.deletedTemplate.entries.length} 個動作）
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => handleOpenSlotPicker(day.slotId, day.label)}
                          className="w-full py-2.5 bg-white dark:bg-slate-900 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200 text-xs font-bold rounded-xl border border-slate-200 dark:border-slate-700 transition cursor-pointer"
                        >
                          改用我的其他範本…
                        </button>
                        <button
                          type="button"
                          onClick={() => handleCreateBlankForSlot(day.slotId, day.label)}
                          className="w-full py-2.5 bg-white dark:bg-slate-900 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-500 dark:text-slate-400 text-xs font-bold rounded-xl border border-dashed border-slate-300 dark:border-slate-700 transition cursor-pointer"
                        >
                          建立空白範本，自己加動作
                        </button>
                      </div>
                    </div>
                  );
                }
                if (editingSlotId === day.slotId) {
                  return (
                    <ProgramDayEditCard
                      key={day.slotId}
                      label={day.label}
                      template={day.template}
                      weekIdx={weekIdx}
                      weekLabel={weekLabel}
                      exerciseMap={exerciseMap}
                      onCancel={() => setEditingSlotId(null)}
                      onSave={handleSaveDay}
                    />
                  );
                }
                const planned = plannedEntriesOf(day.template, weekIdx);
                const skippedCount = day.template.entries.length - planned.length;
                const dayTotal = planned.reduce((sum, entry) => sum + weekTargetOf(entry, weekIdx).sets, 0);
                return (
                  <div
                    key={day.slotId}
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
                          onClick={() => startEditing(day.slotId)}
                          disabled={!!editingSlotId}
                          className="text-[10px] font-bold px-2.5 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700 disabled:opacity-40 transition cursor-pointer"
                        >
                          編輯
                        </button>
                      </div>
                    </div>
                    <div className="space-y-2">
                      {planned.length === 0 && (
                        <p className="text-xs text-slate-400 text-center py-2">這週還沒有動作，按「編輯」加動作。</p>
                      )}
                      {planned.map((entry) => {
                        const target = weekTargetOf(entry, weekIdx);
                        const alternatives = (entry.candidateExerciseIds ?? []).filter((id) => id !== entry.exerciseId);
                        return (
                          <div
                            key={entry.id}
                            className="py-1.5 border-b border-slate-50 dark:border-slate-800/60 last:border-0 space-y-1"
                          >
                            <div className="flex justify-between items-center gap-2">
                              <p className="min-w-0 flex-1 text-xs font-semibold text-slate-700 dark:text-slate-300 truncate">
                                {nameOf(entry.exerciseId)}
                              </p>
                              <span className="shrink-0 text-xs font-bold text-slate-800 dark:text-slate-200 text-right">
                                {target.note ?? `${target.sets}組 × ${target.reps}下`}
                              </span>
                            </div>
                            {alternatives.map((altId) => {
                              const altTarget = weekTargetOf(entry, weekIdx, altId);
                              return (
                                <div key={altId} className="flex justify-between items-center gap-2 pl-3">
                                  <p className="min-w-0 flex-1 text-[11px] font-medium text-slate-500 dark:text-slate-400 truncate">
                                    <span className="text-slate-400 dark:text-slate-500">或 </span>
                                    {nameOf(altId)}
                                  </p>
                                  <span className="shrink-0 text-[11px] font-semibold text-slate-500 dark:text-slate-400 text-right">
                                    {altTarget.note ?? `${altTarget.sets}組 × ${altTarget.reps}下`}
                                  </span>
                                </div>
                              );
                            })}
                          </div>
                        );
                      })}
                    </div>
                    {skippedCount > 0 && (
                      <p className="text-[10px] text-slate-400 font-semibold">
                        {weekLabel} 跳過 {skippedCount} 個動作（按「編輯」可以加回來）
                      </p>
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
        </>
      )}

      {/* 用這週的內容產生空白範本 */}
      {generateSheet && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-[60] flex items-end justify-center">
          <div className="fixed inset-0" onClick={() => !isGenerating && setGenerateSheet(null)} />
          <div className="relative bg-white dark:bg-slate-900 w-full max-w-md rounded-t-2xl shadow-xl z-10 p-5 space-y-4 max-h-[85vh] overflow-y-auto animate-slide-up">
            <div className="flex justify-between items-center border-b border-slate-100 dark:border-slate-800 pb-3">
              <h3 className="font-bold text-slate-800 dark:text-slate-100 text-base">用 {weekLabel} 產生空白範本</h3>
              <button
                onClick={() => setGenerateSheet(null)}
                disabled={isGenerating}
                className="text-slate-400 hover:text-slate-600"
                aria-label="關閉"
              >
                <svg fill="none" viewBox="0 0 24 24" strokeWidth="2.5" stroke="currentColor" className="w-5 h-5">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            {generateSheet.created ? (
              <div className="space-y-3">
                <p className="text-xs font-bold text-emerald-600 dark:text-emerald-400">
                  ✅ 已加到「我的範本」（{generateSheet.created.length} 份）
                </p>
                <ul className="text-xs text-slate-600 dark:text-slate-300 space-y-1 list-disc pl-4">
                  {generateSheet.created.map((name) => (
                    <li key={name}>{name}</li>
                  ))}
                </ul>
                <button
                  type="button"
                  onClick={() => navigate('/')}
                  className="w-full py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold rounded-xl transition cursor-pointer"
                >
                  到訓練頁看我的範本
                </button>
                <button
                  type="button"
                  onClick={() => setGenerateSheet(null)}
                  className="w-full py-2.5 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 text-xs font-bold rounded-xl transition cursor-pointer"
                >
                  關閉
                </button>
              </div>
            ) : (
              <div className="space-y-3">
                <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
                  在「我的範本」新增範本：動作、替代動作、組數×次數照 {weekLabel} 排好，重量留白自己填。之後再改課表不會影響這些範本。
                </p>
                <div className="space-y-2">
                  {liveDayPlans.map((day) => {
                    const planned = plannedEntriesOf(day.template, weekIdx);
                    const totalSets = planned.reduce((sum, entry) => sum + weekTargetOf(entry, weekIdx).sets, 0);
                    const name = generatedName(day.label);
                    const isChecked = generateSheet.selected.includes(day.slotId);
                    const isEmpty = planned.length === 0;
                    return (
                      <label
                        key={day.slotId}
                        className={`flex items-start gap-3 rounded-xl border p-3 transition ${
                          isEmpty ? 'opacity-50' : 'cursor-pointer'
                        } ${
                          isChecked
                            ? 'border-indigo-300 dark:border-indigo-700 bg-indigo-50/50 dark:bg-indigo-950/20'
                            : 'border-slate-200 dark:border-slate-800'
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={isChecked}
                          disabled={isEmpty || isGenerating}
                          onChange={() => toggleGenerateDay(day.slotId)}
                          className="mt-0.5 w-4 h-4 accent-indigo-600"
                        />
                        <span className="min-w-0 space-y-0.5">
                          <span className="block text-sm font-bold text-slate-800 dark:text-slate-200 truncate">{name}</span>
                          <span className="block text-[10px] text-slate-400 font-medium">
                            {isEmpty
                              ? '這週沒有動作'
                              : `${planned.length} 個動作 • ${totalSets} 組 • ${planned
                                  .slice(0, 3)
                                  .map((e) => nameOf(e.exerciseId))
                                  .join('、')}${planned.length > 3 ? '…' : ''}`}
                          </span>
                          {generateSheet.existingNames.includes(name) && (
                            <span className="block text-[10px] text-amber-600 dark:text-amber-400 font-semibold">
                              已經有同名範本，會再多一份
                            </span>
                          )}
                        </span>
                      </label>
                    );
                  })}
                </div>
                <button
                  type="button"
                  onClick={handleGenerate}
                  disabled={isGenerating || generateSheet.selected.length === 0}
                  className="w-full py-3 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white text-sm font-bold rounded-xl shadow-md transition cursor-pointer"
                >
                  {isGenerating ? '產生中...' : `產生 ${generateSheet.selected.length} 份範本`}
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* 範本找不到的那天：改用我的其他範本 */}
      {slotPicker && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-[60] flex items-end justify-center">
          <div className="fixed inset-0" onClick={() => setSlotPicker(null)} />
          <div className="relative bg-white dark:bg-slate-900 w-full max-w-md rounded-t-2xl shadow-xl z-10 p-5 space-y-4 max-h-[85vh] overflow-y-auto animate-slide-up">
            <div className="flex justify-between items-center border-b border-slate-100 dark:border-slate-800 pb-3">
              <h3 className="font-bold text-slate-800 dark:text-slate-100 text-base">
                「{slotPicker.label}」改用哪份範本？
              </h3>
              <button onClick={() => setSlotPicker(null)} className="text-slate-400 hover:text-slate-600" aria-label="關閉">
                <svg fill="none" viewBox="0 0 24 24" strokeWidth="2.5" stroke="currentColor" className="w-5 h-5">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            {slotPicker.templates.length === 0 ? (
              <p className="text-xs text-slate-400 text-center py-8">還沒有其他範本，可以改用「建立空白範本」。</p>
            ) : (
              <div className="space-y-2">
                {slotPicker.templates.map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => handlePickSlotTemplate(t.id)}
                    className="w-full text-left bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 hover:border-indigo-300 rounded-xl p-3 transition cursor-pointer space-y-0.5"
                  >
                    <span className="flex items-center gap-2">
                      <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400">
                        {getTemplateCategory(t)}
                      </span>
                      <span className="font-bold text-sm text-slate-800 dark:text-slate-200 truncate">{t.name}</span>
                    </span>
                    <span className="block text-[10px] text-slate-400 font-medium">
                      {t.entries.length} 個動作 •{' '}
                      {t.entries
                        .map((e) => exerciseMap.get(e.exerciseId)?.name)
                        .filter(Boolean)
                        .slice(0, 3)
                        .join('、')}
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
