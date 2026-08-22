import React, { useEffect, useState, useMemo, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useProgramStore } from '../store/program';
import { listCompletedWorkouts } from '../db/workouts';
import { listExercises } from '../db/exercises';
import { listTemplates } from '../db/templates';
import {
  listDayOverridesInRange,
  saveDayOverride,
  clearDayOverride,
} from '../db/dayOverrides';
import { useActiveWorkoutStore } from '../store/activeWorkout';
import { useSettingsStore } from '../store/settings';
import {
  generateMonthPlan,
  buildCalendarGrid,
  type PlannedDayWithBaseline,
  getValidDatesInRange,
  type ShiftCodeCategory,
  classifyShiftCodeCategory,
  SHIFT_CODE_HEX,
  SHIFT_CODE_BUTTON_CLASSES,
  SHIFT_CODE_CELL_BG_CLASSES,
  buildBaselineOverridesByDate,
  mergeBaselinePlan,
  describeSuggestionLabel,
} from '../lib/shiftPlan';
import { type DayOverride, type ShiftLetter, type Workout, type Exercise, type WorkoutTemplate } from '../db/schema';
import { getDaySummary } from '../lib/workoutSummary';
import { getMuscleIcon } from '../data/muscle-icons';
import { getLocationColor } from '../lib/locationStyle';

const BUTTON_CONFIGS = [
  { label: 'A', value: { shiftLetters: ['A'] as ShiftLetter[], isDayOff: undefined, paused: undefined, forcedRest: undefined, rawLabel: 'A' }, category: 'A' as const, display: '🌅 A 班' },
  { label: 'B', value: { shiftLetters: ['B'] as ShiftLetter[], isDayOff: undefined, paused: undefined, forcedRest: undefined, rawLabel: 'B' }, category: 'B' as const, display: '☀️ B 班' },
  { label: 'C', value: { shiftLetters: ['C'] as ShiftLetter[], isDayOff: undefined, forcedRest: undefined, rawLabel: 'C' }, category: 'C' as const, display: '🌙 C 班' },
  { label: 'AB', value: { shiftLetters: ['A', 'B'] as ShiftLetter[], isDayOff: undefined, forcedRest: undefined, rawLabel: 'AB' }, category: 'AB' as const, display: '🌆 AB 班' },
  { label: 'AC', value: { shiftLetters: ['A', 'C'] as ShiftLetter[], isDayOff: undefined, forcedRest: undefined, rawLabel: 'AC' }, category: 'AC' as const, display: '🔀 AC 班' },
  { label: 'BC', value: { shiftLetters: ['B', 'C'] as ShiftLetter[], isDayOff: undefined, forcedRest: undefined, rawLabel: 'BC' }, category: 'BC' as const, display: '🌄 BC 班' },
  { label: 'ABC', value: { shiftLetters: ['A', 'B', 'C'] as ShiftLetter[], isDayOff: undefined, forcedRest: undefined, rawLabel: 'ABC' }, category: 'ABC' as const, display: '🔥 ABC 班' },
  { label: '休假', value: { shiftLetters: undefined, isDayOff: true, paused: undefined, forcedRest: undefined, rawLabel: '休假' }, category: 'dayoff' as const, display: '🏖️ 休假' },
  { label: '今日無法', value: { shiftLetters: undefined, isDayOff: undefined, paused: true, forcedRest: undefined, rawLabel: '今日無法' }, category: 'unable' as const, display: '🚫 今日無法' },
  { label: '強制休息', value: { shiftLetters: undefined, isDayOff: undefined, paused: undefined, forcedRest: true, rawLabel: '強制休息' }, category: 'forcedRest' as const, display: '🛌 強制休息' },
];

export default function SchedulePage() {
  const navigate = useNavigate();
  const { currentProgram, activeProgram, initProgram, resume } = useProgramStore();

  const [currentMonth, setCurrentMonth] = useState<Date>(() => new Date());
  const [now, setNow] = useState(() => Date.now());
  const [selectedDateStr, setSelectedDateStr] = useState<string | null>(null);

  useEffect(() => {
    initProgram();
  }, [initProgram]);

  useEffect(() => {
    const handleUpdateNow = () => {
      setNow(Date.now());
    };
    window.addEventListener('focus', handleUpdateNow);
    document.addEventListener('visibilitychange', handleUpdateNow);
    return () => {
      window.removeEventListener('focus', handleUpdateNow);
      document.removeEventListener('visibilitychange', handleUpdateNow);
    };
  }, []);

  const [dayOverrides, setDayOverrides] = useState<DayOverride[]>([]);
  const [completedWorkouts, setCompletedWorkouts] = useState<Workout[]>([]);
  const [allExercises, setAllExercises] = useState<Exercise[]>([]);
  const [allTemplates, setAllTemplates] = useState<WorkoutTemplate[]>([]);
  const { activeWorkout } = useActiveWorkoutStore();
  const { settings } = useSettingsStore();
  const [reloadTrigger, setReloadTrigger] = useState(0);

  // 批次編輯狀態
  const [dragStartDateStr, setDragStartDateStr] = useState<string | null>(null);
  const [dragEndDateStr, setDragEndDateStr] = useState<string | null>(null);
  const [isRangeSelecting, setIsRangeSelecting] = useState(false);
  const [rangeEditDates, setRangeEditDates] = useState<string[] | null>(null); // 開批次 sheet 用

  const longPressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const touchStartPosRef = useRef<{ x: number; y: number } | null>(null);
  const activePointerIdRef = useRef<number | null>(null);

  useEffect(() => {
    let active = true;
    const year = currentMonth.getFullYear();
    const month = currentMonth.getMonth() + 1;
    const lastDay = new Date(year, month, 0).getDate();
    const mStr = month.toString().padStart(2, '0');
    const startDateStr = `${year}-${mStr}-01`;
    const endDateStr = `${year}-${mStr}-${lastDay.toString().padStart(2, '0')}`;

    Promise.all([
      listDayOverridesInRange(startDateStr, endDateStr),
      listCompletedWorkouts(),
      listExercises(),
      listTemplates(),
    ]).then(([overrides, workouts, exercises, templates]) => {
      if (active) {
        setDayOverrides(overrides);
        setCompletedWorkouts(workouts);
        setAllExercises(exercises);
        setAllTemplates(templates);
      }
    }).catch((err) => {
      console.error('Failed to load overrides data:', err);
    });

    return () => {
      active = false;
    };
  }, [currentMonth, reloadTrigger]);

  const todayDateStr = useMemo(() => {
    const date = new Date(now);
    const y = date.getFullYear();
    const m = (date.getMonth() + 1).toString().padStart(2, '0');
    const d = date.getDate().toString().padStart(2, '0');
    return `${y}-${m}-${d}`;
  }, [now]);

  const calendarGrid = useMemo(() => {
    return buildCalendarGrid(currentMonth);
  }, [currentMonth]);

  const dateStrings = useMemo(() => {
    return calendarGrid.map((c) => c.dateStr).filter((d): d is string => d !== null);
  }, [calendarGrid]);

  const overridesByDate = useMemo(() => {
    const map = new Map<string, DayOverride>();
    for (const o of dayOverrides) {
      map.set(o.id, o);
    }
    return map;
  }, [dayOverrides]);

  const exerciseMap = useMemo(() => {
    const map = new Map<string, Exercise>();
    for (const ex of allExercises) {
      map.set(ex.id, ex);
    }
    return map;
  }, [allExercises]);

  const templatesById = useMemo(() => {
    const map = new Map<string, WorkoutTemplate>();
    for (const t of allTemplates) {
      map.set(t.id, t);
    }
    return map;
  }, [allTemplates]);

  const plannedDays = useMemo(() => {
    if (dateStrings.length === 0) return [];
    return generateMonthPlan({
      dateStrings,
      activeProgram,
      completedWorkouts,
      activeWorkoutToday: activeWorkout,
      overridesByDate,
      policyOverrides: settings?.shiftPolicyOverrides,
      restOverrideDays: settings?.restOverrideDays ?? 7,
      exerciseMap,
      today: now,
      weeklyTargetSessions: settings?.weeklyTargetSessions ?? 4,
      templatesById,
      programPaused: currentProgram?.status === 'paused',
    });
  }, [dateStrings, activeProgram, completedWorkouts, activeWorkout, overridesByDate, settings, exerciseMap, now, templatesById, currentProgram]);

  const baselineOverridesByDate = useMemo(
    () => buildBaselineOverridesByDate(overridesByDate),
    [overridesByDate]
  );

  const baselinePlannedDays = useMemo(() => {
    if (dateStrings.length === 0) return [];
    return generateMonthPlan({
      dateStrings,
      activeProgram,
      completedWorkouts,
      activeWorkoutToday: activeWorkout,
      overridesByDate: baselineOverridesByDate,
      policyOverrides: settings?.shiftPolicyOverrides,
      restOverrideDays: settings?.restOverrideDays ?? 7,
      exerciseMap,
      today: now,
      weeklyTargetSessions: settings?.weeklyTargetSessions ?? 4,
      templatesById,
      programPaused: currentProgram?.status === 'paused',
    });
  }, [dateStrings, activeProgram, completedWorkouts, activeWorkout, baselineOverridesByDate, settings, exerciseMap, now, templatesById, currentProgram]);

  const plannedDaysWithBaseline = useMemo(
    () => mergeBaselinePlan(plannedDays, baselinePlannedDays),
    [plannedDays, baselinePlannedDays]
  );

  const plannedDayMap = useMemo(() => {
    const map = new Map<string, PlannedDayWithBaseline>();
    for (const day of plannedDaysWithBaseline) {
      map.set(day.dateStr, day);
    }
    return map;
  }, [plannedDaysWithBaseline]);

  const selectedPlannedDay = selectedDateStr ? plannedDayMap.get(selectedDateStr) : undefined;

  const handlePointerDown = (e: React.PointerEvent<HTMLButtonElement>, dateStr: string) => {
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current);
    }
    const clientX = e.clientX;
    const clientY = e.clientY;
    const pointerId = e.pointerId;
    const target = e.currentTarget;

    touchStartPosRef.current = { x: clientX, y: clientY };
    activePointerIdRef.current = pointerId;

    longPressTimerRef.current = setTimeout(() => {
      setIsRangeSelecting(true);
      setDragStartDateStr(dateStr);
      setDragEndDateStr(dateStr);
      try {
        target.setPointerCapture(pointerId);
      } catch (err) {
        console.error('Failed to set pointer capture', err);
      }
    }, 400);
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLButtonElement>) => {
    if (!isRangeSelecting) {
      if (touchStartPosRef.current) {
        const dx = e.clientX - touchStartPosRef.current.x;
        const dy = e.clientY - touchStartPosRef.current.y;
        if (Math.sqrt(dx * dx + dy * dy) > 10) {
          if (longPressTimerRef.current) {
            clearTimeout(longPressTimerRef.current);
            longPressTimerRef.current = null;
          }
          touchStartPosRef.current = null;
          activePointerIdRef.current = null;
        }
      }
      return;
    }

    const element = document.elementFromPoint(e.clientX, e.clientY);
    if (!element) return;

    const cellElement = element.closest('[data-date]');
    if (cellElement) {
      const dateStr = cellElement.getAttribute('data-date');
      const isCellPast = cellElement.getAttribute('data-past') === 'true';
      if (dateStr && !isCellPast) {
        setDragEndDateStr(dateStr);
      }
    }
  };

  const handlePointerUp = (e: React.PointerEvent<HTMLButtonElement>, dateStr: string) => {
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }

    const wasSelecting = isRangeSelecting;
    const startStr = dragStartDateStr;
    const endStr = dragEndDateStr;

    if (activePointerIdRef.current !== null) {
      try {
        e.currentTarget.releasePointerCapture(activePointerIdRef.current);
      } catch {
        // ignore
      }
    }

    setIsRangeSelecting(false);
    setDragStartDateStr(null);
    setDragEndDateStr(null);
    touchStartPosRef.current = null;
    activePointerIdRef.current = null;

    if (wasSelecting && startStr && endStr) {
      const dates = getValidDatesInRange(
        startStr,
        endStr,
        calendarGrid.map((cell) => cell.dateStr),
        todayDateStr
      );

      if (dates.length > 0) {
        setRangeEditDates(dates);
      }
    } else {
      setSelectedDateStr(dateStr);
    }
  };

  const handlePointerCancel = (e: React.PointerEvent<HTMLButtonElement>) => {
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
    if (activePointerIdRef.current !== null) {
      try {
        e.currentTarget.releasePointerCapture(activePointerIdRef.current);
      } catch {
        // ignore
      }
    }
    setIsRangeSelecting(false);
    setDragStartDateStr(null);
    setDragEndDateStr(null);
    touchStartPosRef.current = null;
    activePointerIdRef.current = null;
  };

  const rangeMinDate = dragStartDateStr && dragEndDateStr ? (dragStartDateStr < dragEndDateStr ? dragStartDateStr : dragEndDateStr) : null;
  const rangeMaxDate = dragStartDateStr && dragEndDateStr ? (dragStartDateStr < dragEndDateStr ? dragEndDateStr : dragStartDateStr) : null;

  const handleSingleSave = async (config: typeof BUTTON_CONFIGS[number]) => {
    if (selectedDateStr) {
      const existing = overridesByDate.get(selectedDateStr);
      await saveDayOverride({
        id: selectedDateStr,
        shiftLetters: config.value.shiftLetters,
        isDayOff: config.value.isDayOff,
        paused: config.value.paused,
        forcedRest: config.value.forcedRest,
        rawLabel: config.value.rawLabel,
        pinnedSlotId: existing?.pinnedSlotId,
        pinnedOutcome: existing?.pinnedOutcome,
      });
      setReloadTrigger((t) => t + 1);
      setSelectedDateStr(null);
    }
  };

  const handleBatchSave = async (config: typeof BUTTON_CONFIGS[number]) => {
    if (rangeEditDates && rangeEditDates.length > 0) {
      await Promise.all(rangeEditDates.map((d) => {
        const existing = overridesByDate.get(d);
        return saveDayOverride({
          id: d,
          shiftLetters: config.value.shiftLetters,
          isDayOff: config.value.isDayOff,
          paused: config.value.paused,
          forcedRest: config.value.forcedRest,
          rawLabel: config.value.rawLabel,
          pinnedSlotId: existing?.pinnedSlotId,
          pinnedOutcome: existing?.pinnedOutcome,
        });
      }));
      setReloadTrigger((t) => t + 1);
      setRangeEditDates(null);
    }
  };

  const handlePinSave = async (next: { slotId: string } | { outcome: 'rest' | 'cardio' } | null) => {
    if (!selectedDateStr) return;
    const existing = overridesByDate.get(selectedDateStr);
    await saveDayOverride({
      id: selectedDateStr,
      shiftLetters: existing?.shiftLetters,
      isDayOff: existing?.isDayOff,
      paused: existing?.paused,
      forcedRest: existing?.forcedRest,
      rawLabel: existing?.rawLabel,
      pinnedSlotId: next && 'slotId' in next ? next.slotId : undefined,
      pinnedOutcome: next && 'outcome' in next ? next.outcome : undefined,
    });
    setReloadTrigger((t) => t + 1);
  };

  return (
    <div className="p-4 max-w-md mx-auto space-y-6 pb-20">
      {/* 計畫狀態提示橫幅：暫停中或沒有目前計畫時顯示，active 時不顯示 */}
      {currentProgram?.status === 'paused' ? (
        <div className="bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900 rounded-2xl p-4 shadow-sm flex items-center justify-between gap-3">
          <p className="text-xs font-bold text-amber-700 dark:text-amber-400">
            ⏸ 計畫暫停中，暫不安排課表
          </p>
          <button
            onClick={() => resume()}
            className="shrink-0 px-3 py-1.5 bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold rounded-lg transition cursor-pointer"
          >
            繼續計畫
          </button>
        </div>
      ) : !currentProgram ? (
        <div className="bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 shadow-sm flex items-center justify-between gap-3">
          <p className="text-xs font-bold text-slate-600 dark:text-slate-400">
            尚未設定訓練計畫，目前只顯示班別與訓練紀錄
          </p>
          <button
            onClick={() => navigate('/plan')}
            className="shrink-0 px-3 py-1.5 bg-slate-700 hover:bg-slate-800 dark:bg-slate-700 dark:hover:bg-slate-600 text-white text-xs font-bold rounded-lg transition cursor-pointer"
          >
            前往課表匯入
          </button>
        </div>
      ) : null}

      {/* 班表與本月訓練日程 */}
      <div className="bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 rounded-2xl p-4 shadow-sm space-y-4 transition-colors duration-200">
        <div className="flex justify-between items-center pb-2 border-b border-slate-50 dark:border-slate-800/50">
          <button
            onClick={() => {
              setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() - 1, 1));
            }}
            className="p-1 text-slate-400 hover:text-slate-800 dark:hover:text-slate-200 cursor-pointer transition"
          >
            <svg fill="none" viewBox="0 0 24 24" strokeWidth="2.5" stroke="currentColor" className="w-5 h-5">
              <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5 8.25 12l7.5-7.5" />
            </svg>
          </button>
          <h3 className="font-bold text-slate-800 dark:text-slate-200 text-sm">
            {currentMonth.getFullYear()} 年 {currentMonth.getMonth() + 1} 月班表登記
          </h3>
          <button
            onClick={() => {
              setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1, 1));
            }}
            className="p-1 text-slate-400 hover:text-slate-800 dark:hover:text-slate-200 cursor-pointer transition"
          >
            <svg fill="none" viewBox="0 0 24 24" strokeWidth="2.5" stroke="currentColor" className="w-5 h-5">
              <path strokeLinecap="round" strokeLinejoin="round" d="m8.25 4.5 7.5 7.5-7.5 7.5" />
            </svg>
          </button>
        </div>

        {/* 星期 */}
        <div className="grid grid-cols-7 gap-1 text-center text-[10px] font-bold text-slate-400 uppercase tracking-wider">
          {['日', '一', '二', '三', '四', '五', '六'].map((day) => (
            <div key={day} className="py-1">
              {day}
            </div>
          ))}
        </div>

        {/* 網格 */}
        <div
          className="grid grid-cols-7 gap-1 text-center"
          style={{ touchAction: isRangeSelecting ? 'none' : 'auto' }}
        >
          {calendarGrid.map((cell, idx) => {
            if (!cell.dateStr) {
              return <div key={`empty-${idx}`} className="h-12" />;
            }

            const plannedDay = plannedDayMap.get(cell.dateStr);
            if (!plannedDay) {
              return <div key={`empty-${idx}`} className="h-12" />;
            }

            const isPast = cell.dateStr < todayDateStr;
            const isToday = cell.dateStr === todayDateStr;
            const actualWorkout = plannedDay.actualWorkout;
            const suggestion = plannedDay.suggestion;
            const suggestedSlot = plannedDay.suggestedSlot;
            const override = plannedDay.override;

            let labelText = '';
            let labelColorClass = '';
            let iconHtml = null;
            let iconColor = '';

            if (actualWorkout) {
              const summary = getDaySummary([actualWorkout], exerciseMap);
              iconColor = getLocationColor(summary.location);
              iconHtml = summary.primaryMuscle ? getMuscleIcon(summary.primaryMuscle) : null;
            } else if (isPast) {
              // past without workout: blank
            } else if (override?.paused) {
              labelText = '今日無法';
              labelColorClass = 'text-[8px] text-slate-400 dark:text-slate-500 opacity-60';
            } else if (override?.forcedRest || suggestion === 'forcedRest') {
              labelText = '強制休息';
              labelColorClass = 'text-[8px] text-cyan-600 dark:text-cyan-400 font-semibold';
            } else if (suggestion === 'train' && suggestedSlot) {
              labelText = suggestedSlot.label;
              labelColorClass = 'text-[9px] font-bold text-indigo-600 dark:text-indigo-400';
            } else if (suggestion === 'restOrCardio') {
              labelText = '休息/有氧';
              labelColorClass = 'text-[8px] font-semibold text-slate-500 dark:text-slate-400';
            } else if (suggestion === 'cardio') {
              labelText = '建議有氧';
              labelColorClass = 'text-[8px] font-semibold text-slate-500 dark:text-slate-400';
            }

            let badgeText = '';
            let badgeCategory: ShiftCodeCategory | null = null;
            if (override?.paused) {
              badgeText = '🚫';
              badgeCategory = 'unable';
            } else if (override?.forcedRest) {
              badgeText = '🛌';
              badgeCategory = 'forcedRest';
            } else if (override?.isDayOff) {
              badgeText = '休';
              badgeCategory = 'dayoff';
            } else if (override?.shiftLetters && override.shiftLetters.length > 0) {
              badgeText = [...override.shiftLetters].sort().join('');
              badgeCategory = classifyShiftCodeCategory(badgeText);
            }

            const pinnedSlot = activeProgram?.slots.find((s) => s.id === override?.pinnedSlotId);
            const pinBadgeText = pinnedSlot ? pinnedSlot.label.charAt(0) : '';

            return (
              <button
                key={cell.dateStr}
                disabled={isPast}
                data-date={cell.dateStr}
                data-past={isPast ? 'true' : 'false'}
                onPointerDown={(e) => cell.dateStr && handlePointerDown(e, cell.dateStr)}
                onPointerMove={handlePointerMove}
                onPointerUp={(e) => cell.dateStr && handlePointerUp(e, cell.dateStr)}
                onPointerCancel={handlePointerCancel}
                // Android 長按預設會跳系統的 contextmenu（選取/分享選單），時間點跟我們
                // 自己的長按計時器很接近，會把正在進行中的拖曳手勢打斷——長按批次選取
                // 才會一直卡在「摸了但選不到範圍」。擋掉瀏覽器預設行為，手勢完全交給
                // 上面 pointerdown/move/up 自己判斷。
                onContextMenu={(e) => e.preventDefault()}
                style={{
                  // 手機上若讓瀏覽器自己判斷「這是點擊還是要滾動」，
                  // 手指的自然微小晃動常常被誤判成滑動而觸發 pointercancel，
                  // 導致長按/單點都偵測不到——固定為 none 讓長按計時器自己判斷手勢。
                  touchAction: 'none',
                  WebkitTouchCallout: 'none',
                  userSelect: 'none',
                }}
                className={`h-12 rounded-xl relative flex flex-col items-center justify-between py-1 transition ${
                  isPast ? 'opacity-50 cursor-default' : 'cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-800'
                } ${
                  isRangeSelecting && cell.dateStr && rangeMinDate && rangeMaxDate && cell.dateStr >= rangeMinDate && cell.dateStr <= rangeMaxDate
                    ? 'bg-indigo-100/50 dark:bg-indigo-900/30 ring-2 ring-indigo-400 dark:ring-indigo-500 z-10'
                    : isToday
                    ? 'bg-indigo-50 dark:bg-indigo-950/40 text-indigo-600 dark:text-indigo-400 ring-1 ring-indigo-200 dark:ring-indigo-800'
                    : badgeCategory
                    ? SHIFT_CODE_CELL_BG_CLASSES[badgeCategory]
                    : 'bg-slate-50/50 dark:bg-slate-900/50 hover:bg-slate-100 dark:hover:bg-slate-800'
                }`}
              >
                <span className="text-[10px] font-bold text-slate-700 dark:text-slate-300">{cell.dayNum}</span>
                {badgeText && badgeCategory && (
                  <span
                    style={{ backgroundColor: SHIFT_CODE_HEX[badgeCategory] }}
                    className="absolute top-0.5 right-1 text-[7px] font-extrabold text-white px-1 py-0.2 rounded"
                  >
                    {badgeText}
                  </span>
                )}
                {override?.pinnedSlotId && pinnedSlot && (
                  <span
                    className={`absolute bottom-0.5 left-1 text-[7px] font-extrabold px-1 py-0.2 rounded leading-none flex items-center ${
                      plannedDay.pinConflict
                        ? 'bg-slate-400 dark:bg-slate-600 text-white ring-1 ring-red-500'
                        : 'bg-violet-600 text-white'
                    }`}
                    title={plannedDay.pinConflict ? `指定部位已衝突：${pinnedSlot.label}` : `指定部位：${pinnedSlot.label}`}
                  >
                    {pinBadgeText}{plannedDay.pinConflict ? '⚠️' : ''}
                  </span>
                )}
                {override?.pinnedOutcome && (
                  <span
                    className={`absolute bottom-0.5 left-1 text-[7px] font-extrabold px-1 py-0.2 rounded leading-none flex items-center text-white ${
                      override.pinnedOutcome === 'cardio' ? 'bg-teal-600' : 'bg-slate-600'
                    }`}
                    title={override.pinnedOutcome === 'cardio' ? '指定：有氧' : '指定：休息'}
                  >
                    {override.pinnedOutcome === 'cardio' ? '🏃' : '😴'}
                  </span>
                )}
                {plannedDay.diverged && (
                  <span
                    className="absolute bottom-0.5 right-1 text-[7px] font-extrabold px-1 py-0.2 rounded leading-none bg-orange-500 text-white"
                    title={`原定：${describeSuggestionLabel(plannedDay.baselineSuggestion, plannedDay.baselineSuggestedSlot)}`}
                  >
                    改
                  </span>
                )}
                <div className="h-4 flex items-center justify-center">
                  {iconHtml ? (
                    <svg viewBox="0 0 24 24" fill="currentColor" style={{ color: iconColor }}
                      className="w-3.5 h-3.5" dangerouslySetInnerHTML={{ __html: iconHtml }} />
                  ) : labelText ? (
                    <span className={labelColorClass}>{labelText}</span>
                  ) : null}
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* 編輯日期 Sheet */}
      {selectedDateStr && (
        <div className="fixed inset-0 bg-black/40 dark:bg-slate-950/60 backdrop-blur-sm z-[60] flex items-end justify-center">
          <div className="fixed inset-0" onClick={() => setSelectedDateStr(null)} />
          <div className="relative bg-white dark:bg-slate-900 w-full max-w-md rounded-t-2xl shadow-xl z-10 p-5 space-y-4 max-h-[85vh] overflow-y-auto animate-slide-up transition-colors duration-200">
            {/* 標頭 */}
            <div className="flex justify-between items-center border-b border-slate-100 dark:border-slate-800 pb-3">
              <h3 className="font-bold text-slate-800 dark:text-slate-200 text-sm">
                編輯 {selectedDateStr}
              </h3>
              <div className="flex items-center gap-3">
                <button
                  onClick={async () => {
                    await clearDayOverride(selectedDateStr);
                    setReloadTrigger((t) => t + 1);
                    setSelectedDateStr(null);
                  }}
                  className="text-xs font-bold text-red-500 hover:text-red-700"
                >
                  清除登記
                </button>
                <button
                  onClick={() => setSelectedDateStr(null)}
                  className="text-xs font-bold text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
                >
                  關閉
                </button>
              </div>
            </div>

            {selectedPlannedDay && !selectedPlannedDay.isPast && (
              <div className="text-xs bg-slate-50 dark:bg-slate-800/60 rounded-xl p-3 space-y-1">
                <div className="flex justify-between">
                  <span className="text-slate-500 dark:text-slate-400">原定建議</span>
                  <span className="font-semibold text-slate-700 dark:text-slate-300">
                    {describeSuggestionLabel(selectedPlannedDay.baselineSuggestion, selectedPlannedDay.baselineSuggestedSlot)}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500 dark:text-slate-400">實際安排</span>
                  <span className={`font-semibold ${selectedPlannedDay.diverged ? 'text-orange-600 dark:text-orange-400' : 'text-slate-700 dark:text-slate-300'}`}>
                    {describeSuggestionLabel(selectedPlannedDay.suggestion, selectedPlannedDay.suggestedSlot)}
                  </span>
                </div>
              </div>
            )}

            {/* 內容：分區 */}
            <div className="space-y-4 pt-2">
              <div>
                <span className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider block mb-2">班別登記</span>
                <div className="grid grid-cols-3 gap-2">
                  {BUTTON_CONFIGS.slice(0, 8).map((config) => (
                    <button
                      key={config.label}
                      type="button"
                      onClick={() => handleSingleSave(config)}
                      className={`py-3 text-center font-bold text-xs rounded-xl transition border hover:opacity-80 active:opacity-90 ${SHIFT_CODE_BUTTON_CLASSES[config.category as ShiftCodeCategory]}`}
                    >
                      {config.display}
                    </button>
                  ))}
                </div>
              </div>

              <div className="border-t border-slate-100 dark:border-slate-800/80 pt-3">
                <span className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider block mb-2">訓練覆寫</span>
                <div className="grid grid-cols-2 gap-2">
                  {BUTTON_CONFIGS.slice(8, 10).map((config) => (
                    <button
                      key={config.label}
                      type="button"
                      onClick={() => handleSingleSave(config)}
                      className={`py-3 text-center font-bold text-xs rounded-xl transition border hover:opacity-80 active:opacity-90 ${SHIFT_CODE_BUTTON_CLASSES[config.category as ShiftCodeCategory]}`}
                    >
                      {config.display}
                    </button>
                  ))}
                </div>
              </div>

              {activeProgram && (
                <div className="border-t border-slate-100 dark:border-slate-800/80 pt-3">
                  <span className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider block mb-2">
                    指定當天安排
                  </span>
                  {activeProgram.slots.length > 0 && (
                    <div className="grid grid-cols-2 gap-2 mb-2">
                      {activeProgram.slots.map((slot) => {
                        const alreadyDoneThisLap = activeProgram.completedSlotIdsThisLap.includes(slot.id);
                        const isPinned = overridesByDate.get(selectedDateStr)?.pinnedSlotId === slot.id;
                        return (
                          <button
                            key={slot.id}
                            type="button"
                            disabled={alreadyDoneThisLap}
                            onClick={() => handlePinSave(isPinned ? null : { slotId: slot.id })}
                            className={`py-3 text-center font-bold text-xs rounded-xl transition border ${
                              alreadyDoneThisLap
                                ? 'opacity-40 cursor-not-allowed bg-slate-50 dark:bg-slate-900 border-slate-200 dark:border-slate-800 text-slate-400'
                                : isPinned
                                ? 'bg-violet-600 border-violet-600 text-white shadow-sm'
                                : 'bg-violet-50 dark:bg-violet-950/40 border-violet-200 dark:border-violet-900 text-violet-600 dark:text-violet-400 hover:opacity-80'
                            }`}
                          >
                            {slot.label}{alreadyDoneThisLap ? '（這輪已練過）' : ''}
                          </button>
                        );
                      })}
                    </div>
                  )}
                  <div className="grid grid-cols-2 gap-2">
                    {(() => {
                      const isPinnedRest = overridesByDate.get(selectedDateStr)?.pinnedOutcome === 'rest';
                      return (
                        <button
                          type="button"
                          onClick={() => handlePinSave(isPinnedRest ? null : { outcome: 'rest' })}
                          className={`py-3 text-center font-bold text-xs rounded-xl transition border ${
                            isPinnedRest
                              ? 'bg-slate-600 border-slate-600 text-white shadow-sm'
                              : 'bg-slate-50 dark:bg-slate-900 border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400 hover:opacity-80'
                          }`}
                        >
                          😴 休息
                        </button>
                      );
                    })()}
                    {(() => {
                      const isPinnedCardio = overridesByDate.get(selectedDateStr)?.pinnedOutcome === 'cardio';
                      return (
                        <button
                          type="button"
                          onClick={() => handlePinSave(isPinnedCardio ? null : { outcome: 'cardio' })}
                          className={`py-3 text-center font-bold text-xs rounded-xl transition border ${
                            isPinnedCardio
                              ? 'bg-teal-600 border-teal-600 text-white shadow-sm'
                              : 'bg-teal-50 dark:bg-teal-950/40 border-teal-200 dark:border-teal-900 text-teal-600 dark:text-teal-400 hover:opacity-80'
                          }`}
                        >
                          🏃 有氧
                        </button>
                      );
                    })()}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* 批次編輯日期 Sheet */}
      {rangeEditDates && rangeEditDates.length > 0 && (
        <div className="fixed inset-0 bg-black/40 dark:bg-slate-950/60 backdrop-blur-sm z-[60] flex items-end justify-center">
          <div className="fixed inset-0" onClick={() => setRangeEditDates(null)} />
          <div className="relative bg-white dark:bg-slate-900 w-full max-w-md rounded-t-2xl shadow-xl z-10 p-5 space-y-4 max-h-[85vh] overflow-y-auto animate-slide-up transition-colors duration-200">
            {/* 標頭 */}
            <div className="flex justify-between items-center border-b border-slate-100 dark:border-slate-800 pb-3">
              <h3 className="font-bold text-slate-800 dark:text-slate-200 text-sm">
                編輯 {rangeEditDates[0]} ~ {rangeEditDates[rangeEditDates.length - 1]}（{rangeEditDates.length} 天）
              </h3>
              <div className="flex items-center gap-3">
                <button
                  onClick={async () => {
                    await Promise.all(rangeEditDates.map((d) => clearDayOverride(d)));
                    setReloadTrigger((t) => t + 1);
                    setRangeEditDates(null);
                  }}
                  className="text-xs font-bold text-red-500 hover:text-red-700"
                >
                  清除登記
                </button>
                <button
                  onClick={() => setRangeEditDates(null)}
                  className="text-xs font-bold text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
                >
                  關閉
                </button>
              </div>
            </div>

            {/* 內容：分區 */}
            <div className="space-y-4 pt-2">
              <div>
                <span className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider block mb-2">班別登記</span>
                <div className="grid grid-cols-3 gap-2">
                  {BUTTON_CONFIGS.slice(0, 8).map((config) => (
                    <button
                      key={config.label}
                      type="button"
                      onClick={() => handleBatchSave(config)}
                      className={`py-3 text-center font-bold text-xs rounded-xl transition border hover:opacity-80 active:opacity-90 ${SHIFT_CODE_BUTTON_CLASSES[config.category as ShiftCodeCategory]}`}
                    >
                      {config.display}
                    </button>
                  ))}
                </div>
              </div>

              <div className="border-t border-slate-100 dark:border-slate-800/80 pt-3">
                <span className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider block mb-2">訓練覆寫</span>
                <div className="grid grid-cols-2 gap-2">
                  {BUTTON_CONFIGS.slice(8, 10).map((config) => (
                    <button
                      key={config.label}
                      type="button"
                      onClick={() => handleBatchSave(config)}
                      className={`py-3 text-center font-bold text-xs rounded-xl transition border hover:opacity-80 active:opacity-90 ${SHIFT_CODE_BUTTON_CLASSES[config.category as ShiftCodeCategory]}`}
                    >
                      {config.display}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
