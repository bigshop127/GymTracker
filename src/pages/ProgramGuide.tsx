import { useEffect, useState, useMemo, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useProgramStore } from '../store/program';
import { isZongYuanProgramImported, importZongYuanProgram } from '../lib/importZongYuanProgram';
import {
  ZONGYUAN_8WEEK_PLAN,
  ZONGYUAN_WEEK_LABELS,
  ZONGYUAN_COACH_CHECK_TABLE,
  ZONGYUAN_PROGRAM_NAME,
} from '../data/zongyuan-8week-program';
import { listCompletedWorkouts } from '../db/workouts';
import { listExercises } from '../db/exercises';
import {
  listDayOverridesInRange,
  saveDayOverride,
  clearDayOverride,
  bulkSaveDayOverride,
} from '../db/dayOverrides';
import { useActiveWorkoutStore } from '../store/activeWorkout';
import { useSettingsStore } from '../store/settings';
import {
  generateMonthPlan,
  buildCalendarGrid,
  type PlannedDay,
  getValidDatesInRange,
} from '../lib/shiftPlan';
import { type DayOverride, type ShiftLetter, type Workout, type Exercise } from '../db/schema';
import { getDaySummary } from '../lib/workoutSummary';
import { getMuscleIcon } from '../data/muscle-icons';
import { getLocationColor } from '../lib/locationStyle';

export default function ProgramGuide() {
  const navigate = useNavigate();
  const { activeProgram, initProgram } = useProgramStore();
  const [isImported, setIsImported] = useState<boolean | null>(null);
  const [isImporting, setIsImporting] = useState(false);
  // null = 尚未手動選過週次，跟著目前計畫進度自動顯示
  const [manualWeek, setManualWeek] = useState<number | null>(null);

  // --- 班表與訓練日程狀態與邏輯 ---
  const [currentMonth, setCurrentMonth] = useState<Date>(() => new Date());
  const [now, setNow] = useState(() => Date.now());
  const [selectedDateStr, setSelectedDateStr] = useState<string | null>(null);

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
  const { activeWorkout } = useActiveWorkoutStore();
  const { settings } = useSettingsStore();
  const [reloadTrigger, setReloadTrigger] = useState(0);

  // 編輯日期 override 的本地狀態
  const [editShiftLetters, setEditShiftLetters] = useState<ShiftLetter[]>([]);
  const [editIsDayOff, setEditIsDayOff] = useState(false);
  const [editPaused, setEditPaused] = useState(false);

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
    ]).then(([overrides, workouts, exercises]) => {
      if (active) {
        setDayOverrides(overrides);
        setCompletedWorkouts(workouts);
        setAllExercises(exercises);
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
    });
  }, [dateStrings, activeProgram, completedWorkouts, activeWorkout, overridesByDate, settings, exerciseMap, now]);

  const plannedDayMap = useMemo(() => {
    const map = new Map<string, PlannedDay>();
    for (const day of plannedDays) {
      map.set(day.dateStr, day);
    }
    return map;
  }, [plannedDays]);

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
        setEditShiftLetters([]);
        setEditIsDayOff(false);
        setEditPaused(false);
      }
    } else {
      const existing = overridesByDate.get(dateStr);
      setEditShiftLetters(existing?.shiftLetters || []);
      setEditIsDayOff(existing?.isDayOff || false);
      setEditPaused(existing?.paused || false);
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

  const rangeMinDate = dragStartDateStr && dragEndDateStr ? (dragStartDateStr < dragEndDateStr ? dragStartDateStr : dragEndDateStr) : null;
  const rangeMaxDate = dragStartDateStr && dragEndDateStr ? (dragStartDateStr < dragEndDateStr ? dragEndDateStr : dragStartDateStr) : null;

  return (
    <div className="p-4 max-w-md mx-auto space-y-6 pb-10">
      {/* 班表與本月訓練日程 */}
      {activeProgram && (
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
              {currentMonth.getFullYear()} 年 {currentMonth.getMonth() + 1} 月訓練建議
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
                labelText = '暫停';
                labelColorClass = 'text-[9px] text-slate-400 dark:text-slate-500 opacity-60';
              } else if (suggestion === 'train' && suggestedSlot) {
                labelText = suggestedSlot.label;
                labelColorClass = 'text-[9px] font-bold text-indigo-600 dark:text-indigo-400';
              } else if (suggestion === 'restOrCardio') {
                labelText = '休息/有氧';
                labelColorClass = 'text-[8px] font-semibold text-slate-500 dark:text-slate-400';
              }

              const badgeText = override?.isDayOff
                ? '休'
                : override?.shiftLetters && override.shiftLetters.length > 0
                ? override.shiftLetters.sort().join('')
                : '';

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
                  style={{
                    touchAction: isRangeSelecting ? 'none' : 'auto',
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
                      : 'bg-slate-50/50 dark:bg-slate-900/50 hover:bg-slate-100 dark:hover:bg-slate-800'
                  }`}
                >
                  <span className="text-[10px] font-bold text-slate-700 dark:text-slate-300">{cell.dayNum}</span>
                  {badgeText && (
                    <span className="absolute top-0.5 right-1 text-[7px] font-extrabold text-slate-400 dark:text-slate-500">
                      {badgeText}
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
      )}

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

      {/* 編輯日期 Sheet */}
      {selectedDateStr && (
        <div className="fixed inset-0 bg-black/40 dark:bg-slate-950/60 backdrop-blur-sm z-50 flex items-end justify-center">
          <div className="fixed inset-0" onClick={() => setSelectedDateStr(null)} />
          <div className="relative bg-white dark:bg-slate-900 w-full max-w-md rounded-t-2xl shadow-xl z-10 p-5 space-y-4 max-h-[85vh] overflow-y-auto animate-slide-up transition-colors duration-200">
            {/* 標頭 */}
            <div className="flex justify-between items-center border-b border-slate-100 dark:border-slate-800 pb-3">
              <h3 className="font-bold text-slate-800 dark:text-slate-200 text-sm">
                編輯 {selectedDateStr} 登記與暫停
              </h3>
              <button
                onClick={() => setSelectedDateStr(null)}
                className="text-xs font-bold text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
              >
                關閉
              </button>
            </div>

            {/* 內容 */}
            <div className="space-y-4 pt-2">
              {/* 班別選擇 */}
              <div className="space-y-2">
                <label className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider block">
                  今日班別 (可複選)
                </label>
                <div className="flex gap-2">
                  {(['A', 'B', 'C'] as ShiftLetter[]).map((letter) => {
                    const isSelected = editShiftLetters.includes(letter);
                    return (
                      <button
                        key={letter}
                        type="button"
                        onClick={() => {
                          setEditIsDayOff(false); // Mutually exclusive with isDayOff
                          if (isSelected) {
                            setEditShiftLetters(editShiftLetters.filter((l) => l !== letter));
                          } else {
                            setEditShiftLetters([...editShiftLetters, letter]);
                          }
                        }}
                        className={`flex-1 py-2 text-center font-bold text-xs rounded-xl transition border ${
                          isSelected
                            ? 'bg-indigo-50 border-indigo-200 text-indigo-600 dark:bg-indigo-950/40 dark:border-indigo-900 dark:text-indigo-400'
                            : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50 dark:bg-slate-900 dark:border-slate-800 dark:text-slate-400 dark:hover:bg-slate-800'
                        }`}
                      >
                        {letter} 班
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* 休假設定 */}
              <div className="space-y-2">
                <label className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider block">
                  休假標記 (與班別互斥)
                </label>
                <button
                  type="button"
                  onClick={() => {
                    setEditIsDayOff(!editIsDayOff);
                    setEditShiftLetters([]); // Mutually exclusive with ABC
                  }}
                  className={`w-full py-2.5 text-center font-bold text-xs rounded-xl transition border ${
                    editIsDayOff
                      ? 'bg-indigo-50 border-indigo-200 text-indigo-600 dark:bg-indigo-950/40 dark:border-indigo-900 dark:text-indigo-400'
                      : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50 dark:bg-slate-900 dark:border-slate-800 dark:text-slate-400 dark:hover:bg-slate-800'
                  }`}
                >
                  🏖️ 休假
                </button>
              </div>

              {/* 暫停訓練 */}
              <div className="flex items-center gap-2.5 py-2 border-t border-slate-50 dark:border-slate-800/60 pt-4">
                <input
                  type="checkbox"
                  id="editPausedCheckbox"
                  checked={editPaused}
                  onChange={(e) => setEditPaused(e.target.checked)}
                  className="w-4 h-4 text-indigo-600 border-slate-300 rounded focus:ring-indigo-500"
                />
                <label htmlFor="editPausedCheckbox" className="text-xs font-bold text-slate-700 dark:text-slate-300 select-none">
                  暫停建議（今天有急事 / 下雨）
                </label>
              </div>

              {/* 功能按鈕 */}
              <div className="flex gap-3 pt-4 border-t border-slate-50 dark:border-slate-800/60">
                <button
                  type="button"
                  onClick={async () => {
                    if (selectedDateStr) {
                      await clearDayOverride(selectedDateStr);
                      setReloadTrigger((t) => t + 1);
                      setSelectedDateStr(null);
                    }
                  }}
                  className="flex-1 py-2.5 text-center font-bold text-xs rounded-xl transition bg-slate-100 hover:bg-slate-200 text-slate-600 dark:bg-slate-800 dark:hover:bg-slate-700 dark:text-slate-300"
                >
                  清除登記
                </button>
                <button
                  type="button"
                  onClick={async () => {
                    if (selectedDateStr) {
                      const rawLabel = editIsDayOff
                        ? '休假'
                        : editShiftLetters.length > 0
                        ? editShiftLetters.sort().join('')
                        : undefined;

                      await saveDayOverride({
                        id: selectedDateStr,
                        shiftLetters: editShiftLetters.length > 0 ? editShiftLetters : undefined,
                        isDayOff: editIsDayOff || undefined,
                        paused: editPaused || undefined,
                        rawLabel,
                      });
                      setReloadTrigger((t) => t + 1);
                      setSelectedDateStr(null);
                    }
                  }}
                  className="flex-1 py-2.5 text-center font-bold text-xs rounded-xl bg-indigo-600 hover:bg-indigo-700 active:bg-indigo-800 text-white shadow-sm transition"
                >
                  儲存
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 批次編輯日期 Sheet */}
      {rangeEditDates && rangeEditDates.length > 0 && (
        <div className="fixed inset-0 bg-black/40 dark:bg-slate-950/60 backdrop-blur-sm z-50 flex items-end justify-center">
          <div className="fixed inset-0" onClick={() => setRangeEditDates(null)} />
          <div className="relative bg-white dark:bg-slate-900 w-full max-w-md rounded-t-2xl shadow-xl z-10 p-5 space-y-4 max-h-[85vh] overflow-y-auto animate-slide-up transition-colors duration-200">
            {/* 標頭 */}
            <div className="flex justify-between items-center border-b border-slate-100 dark:border-slate-800 pb-3">
              <h3 className="font-bold text-slate-800 dark:text-slate-200 text-sm">
                編輯 {rangeEditDates[0]} ~ {rangeEditDates[rangeEditDates.length - 1]}（{rangeEditDates.length} 天）登記與暫停
              </h3>
              <button
                onClick={() => setRangeEditDates(null)}
                className="text-xs font-bold text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
              >
                關閉
              </button>
            </div>

            {/* 內容 */}
            <div className="space-y-4 pt-2">
              {/* 班別選擇 */}
              <div className="space-y-2">
                <label className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider block">
                  今日班別 (可複選)
                </label>
                <div className="flex gap-2">
                  {(['A', 'B', 'C'] as ShiftLetter[]).map((letter) => {
                    const isSelected = editShiftLetters.includes(letter);
                    return (
                      <button
                        key={letter}
                        type="button"
                        onClick={() => {
                          setEditIsDayOff(false); // Mutually exclusive with isDayOff
                          if (isSelected) {
                            setEditShiftLetters(editShiftLetters.filter((l) => l !== letter));
                          } else {
                            setEditShiftLetters([...editShiftLetters, letter]);
                          }
                        }}
                        className={`flex-1 py-2 text-center font-bold text-xs rounded-xl transition border ${
                          isSelected
                            ? 'bg-indigo-50 border-indigo-200 text-indigo-600 dark:bg-indigo-950/40 dark:border-indigo-900 dark:text-indigo-400'
                            : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50 dark:bg-slate-900 dark:border-slate-800 dark:text-slate-400 dark:hover:bg-slate-800'
                        }`}
                      >
                        {letter} 班
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* 休假設定 */}
              <div className="space-y-2">
                <label className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider block">
                  休假標記 (與班別互斥)
                </label>
                <button
                  type="button"
                  onClick={() => {
                    setEditIsDayOff(!editIsDayOff);
                    setEditShiftLetters([]); // Mutually exclusive with ABC
                  }}
                  className={`w-full py-2.5 text-center font-bold text-xs rounded-xl transition border ${
                    editIsDayOff
                      ? 'bg-indigo-50 border-indigo-200 text-indigo-600 dark:bg-indigo-950/40 dark:border-indigo-900 dark:text-indigo-400'
                      : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50 dark:bg-slate-900 dark:border-slate-800 dark:text-slate-400 dark:hover:bg-slate-800'
                  }`}
                >
                  🏖️ 休假
                </button>
              </div>

              {/* 暫停訓練 */}
              <div className="flex items-center gap-2.5 py-2 border-t border-slate-50 dark:border-slate-800/60 pt-4">
                <input
                  type="checkbox"
                  id="rangeEditPausedCheckbox"
                  checked={editPaused}
                  onChange={(e) => setEditPaused(e.target.checked)}
                  className="w-4 h-4 text-indigo-600 border-slate-300 rounded focus:ring-indigo-500"
                />
                <label htmlFor="rangeEditPausedCheckbox" className="text-xs font-bold text-slate-700 dark:text-slate-300 select-none">
                  暫停建議（今天有急事 / 下雨）
                </label>
              </div>

              {/* 功能按鈕 */}
              <div className="flex gap-3 pt-4 border-t border-slate-50 dark:border-slate-800/60">
                <button
                  type="button"
                  onClick={async () => {
                    if (rangeEditDates) {
                      await Promise.all(rangeEditDates.map((d) => clearDayOverride(d)));
                      setReloadTrigger((t) => t + 1);
                      setRangeEditDates(null);
                    }
                  }}
                  className="flex-1 py-2.5 text-center font-bold text-xs rounded-xl transition bg-slate-100 hover:bg-slate-200 text-slate-600 dark:bg-slate-800 dark:hover:bg-slate-700 dark:text-slate-300"
                >
                  清除登記
                </button>
                <button
                  type="button"
                  onClick={async () => {
                    if (rangeEditDates) {
                      const rawLabel = editIsDayOff
                        ? '休假'
                        : editShiftLetters.length > 0
                        ? editShiftLetters.sort().join('')
                        : undefined;

                      await bulkSaveDayOverride(rangeEditDates, {
                        shiftLetters: editShiftLetters.length > 0 ? editShiftLetters : undefined,
                        isDayOff: editIsDayOff || undefined,
                        paused: editPaused || undefined,
                        rawLabel,
                      });
                      setReloadTrigger((t) => t + 1);
                      setRangeEditDates(null);
                    }
                  }}
                  className="flex-1 py-2.5 text-center font-bold text-xs rounded-xl bg-indigo-600 hover:bg-indigo-700 active:bg-indigo-800 text-white shadow-sm transition"
                >
                  儲存
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
