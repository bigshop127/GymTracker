import {
  type DayOverride,
  type ShiftPolicy,
  type TrainingProgram,
  type ProgramSlot,
  type Workout,
  type Exercise
} from '../db/schema';

export type DayPlanSuggestion = 'train' | 'restOrCardio' | 'paused' | 'noProgram' | 'past';

export interface PlannedDay {
  dateStr: string;
  isPast: boolean;
  isToday: boolean;
  override: DayOverride | null;
  actualWorkout: Workout | null;      // 當天已有紀錄（completed 或 active）就帶進來；有值時 UI 顯示優先權高於 suggestion
  suggestion: DayPlanSuggestion;
  suggestedSlot: ProgramSlot | null;  // 只有 suggestion === 'train' 才有值
}

export const DEFAULT_SHIFT_POLICIES: Record<string, ShiftPolicy> = {
  'DAYOFF': 'train',
  'A': 'train',
  'B': 'train',
  'C': 'train',
  'AB': 'restOrCardio',
  'AC': 'restOrCardio',
  'BC': 'restOrCardio',
  'ABC': 'restOrCardio',
};

export function classifyShiftCode(
  override: DayOverride | null | undefined,
  policyOverrides: Record<string, ShiftPolicy> | undefined,
): ShiftPolicy {
  if (!override || override.isDayOff || !override.shiftLetters || override.shiftLetters.length === 0) {
    const policy = policyOverrides?.['DAYOFF'] || DEFAULT_SHIFT_POLICIES['DAYOFF'];
    return policy || 'train';
  }
  
  const key = [...override.shiftLetters].sort().join('');
  const policy = policyOverrides?.[key] || DEFAULT_SHIFT_POLICIES[key];
  return policy || 'train';
}

export function getCalendarDaysDiff(dateStr1: string, dateStr2: string): number {
  const [y1, m1, d1] = dateStr1.split('-').map(Number);
  const [y2, m2, d2] = dateStr2.split('-').map(Number);
  const t1 = new Date(y1, m1 - 1, d1).getTime();
  const t2 = new Date(y2, m2 - 1, d2).getTime();
  return Math.round(Math.abs(t2 - t1) / (1000 * 60 * 60 * 24));
}

function getLocalDateStr(timestamp: number): string {
  const date = new Date(timestamp);
  const y = date.getFullYear();
  const m = (date.getMonth() + 1).toString().padStart(2, '0');
  const d = date.getDate().toString().padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function getWeekStart(dateStr: string): string {
  const [y, m, d] = dateStr.split('-').map(Number);
  const date = new Date(y, m - 1, d);
  date.setDate(date.getDate() - date.getDay()); // 回推到當週週日
  return getLocalDateStr(date.getTime());
}

export type ShiftCodeCategory = 'A' | 'B' | 'C' | 'combo' | 'dayoff' | 'unable';

export function classifyShiftCodeCategory(code: string): ShiftCodeCategory {
  if (code === 'A' || code === 'B' || code === 'C') return code;
  if (code === '休假') return 'dayoff';
  if (code === '今日無法') return 'unable';
  return 'combo'; // AB/AC/BC/ABC 一律歸這類
}

export const SHIFT_CODE_EMOJI: Record<ShiftCodeCategory, string> = {
  A: '🌅', B: '☀️', C: '🌙', combo: '🔥', dayoff: '🏖️', unable: '🚫',
};

// 月曆角落徽章用：比照 locationStyle.ts 的 getLocationColor 寫法，回傳 hex 直接進 inline style。
export const SHIFT_CODE_HEX: Record<ShiftCodeCategory, string> = {
  A: '#3b82f6',      // blue-500
  B: '#f59e0b',      // amber-500
  C: '#a855f7',       // purple-500
  combo: '#f43f5e',   // rose-500
  dayoff: '#10b981',  // emerald-500
  unable: '#334155',  // slate-700
};

// 九宮格按鈕用：完整 Tailwind class 字面值查表
export const SHIFT_CODE_BUTTON_CLASSES: Record<ShiftCodeCategory, string> = {
  A: 'bg-blue-50 dark:bg-blue-950/40 border-blue-200 dark:border-blue-900 text-blue-600 dark:text-blue-400',
  B: 'bg-amber-50 dark:bg-amber-950/40 border-amber-200 dark:border-amber-900 text-amber-600 dark:text-amber-400',
  C: 'bg-purple-50 dark:bg-purple-950/40 border-purple-200 dark:border-purple-900 text-purple-600 dark:text-purple-400',
  combo: 'bg-rose-50 dark:bg-rose-950/40 border-rose-200 dark:border-rose-900 text-rose-600 dark:text-rose-400',
  dayoff: 'bg-emerald-50 dark:bg-emerald-950/40 border-emerald-200 dark:border-emerald-900 text-emerald-600 dark:text-emerald-400',
  unable: 'bg-slate-100 dark:bg-slate-800 border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-300',
};

export interface GenerateMonthPlanInput {
  dateStrings: string[];              // 要顯示的整個月曆範圍（含當月已過去的日期），由小到大排序
  activeProgram: TrainingProgram | null;
  completedWorkouts: Workout[];       // listCompletedWorkouts() 的結果
  activeWorkoutToday: Workout | null; // 來自 useActiveWorkoutStore 的進行中訓練（還沒 complete，不在上面那個陣列裡）
  overridesByDate: Map<string, DayOverride>;
  policyOverrides: Record<string, ShiftPolicy> | undefined;
  restOverrideDays: number;
  exerciseMap: Map<string, Exercise>; // 判斷「是不是純有氧」用，buildExerciseMap() 建
  today: number;                      // Date.now()，測試時可以注入固定時間
  weeklyTargetSessions?: number;       // 新增：settings?.weeklyTargetSessions ?? 4
}

export function generateMonthPlan(input: GenerateMonthPlanInput): PlannedDay[] {
  const {
    dateStrings,
    activeProgram,
    completedWorkouts,
    activeWorkoutToday,
    overridesByDate,
    policyOverrides,
    restOverrideDays,
    exerciseMap,
    today,
    weeklyTargetSessions = 4,
  } = input;

  const todayStr = getLocalDateStr(today);

  // Group completed workouts by local date string
  const completedByDate = new Map<string, Workout>();
  for (const w of completedWorkouts) {
    const ds = getLocalDateStr(w.startedAt);
    completedByDate.set(ds, w);
  }

  // Active workout today
  let activeToday: Workout | null = null;
  if (activeWorkoutToday) {
    const ds = getLocalDateStr(activeWorkoutToday.startedAt);
    if (ds === todayStr) {
      activeToday = activeWorkoutToday;
    }
  }

  // Find latest completed weight training workout
  let maxWeightStartedAt = 0;
  for (const w of completedWorkouts) {
    const isWeight = w.entries.some(entry => {
      const ex = exerciseMap.get(entry.exerciseId);
      return ex ? ex.muscleGroup !== '有氧' : false;
    });
    if (isWeight && w.startedAt > maxWeightStartedAt) {
      maxWeightStartedAt = w.startedAt;
    }
  }

  let daysSinceWeights = 99999;
  if (maxWeightStartedAt > 0) {
    const wDateStr = getLocalDateStr(maxWeightStartedAt);
    daysSinceWeights = getCalendarDaysDiff(wDateStr, todayStr);
  }

  let simCursor = activeProgram ? activeProgram.cursor : 0;
  const slots = activeProgram ? activeProgram.slots : [];

  const plannedDays: PlannedDay[] = [];

  // 迴圈開始前：用 completedWorkouts 墊底「本月第一天所在那週、月初之前已經練過幾次」
  let currentWeekStart = dateStrings.length > 0 ? getWeekStart(dateStrings[0]) : '';
  let trainedThisWeek = 0;
  if (currentWeekStart && dateStrings.length > 0) {
    for (const w of completedWorkouts) {
      const ds = getLocalDateStr(w.startedAt);
      if (ds >= currentWeekStart && ds < dateStrings[0]) {
        trainedThisWeek += 1;
      }
    }
  }

  for (const dateStr of dateStrings) {
    const weekStart = getWeekStart(dateStr);
    if (weekStart !== currentWeekStart) {
      currentWeekStart = weekStart;
      trainedThisWeek = 0;
    }

    const isPast = dateStr < todayStr;
    const isToday = dateStr === todayStr;
    const override = overridesByDate.get(dateStr) || null;
    const actualWorkout = completedByDate.get(dateStr) || (isToday ? activeToday : null);

    if (actualWorkout) {
      trainedThisWeek += 1; // 不管過去或今天，有實際紀錄就算這週練過一次
    }

    let suggestion: DayPlanSuggestion;
    let suggestedSlot: ProgramSlot | null = null;

    if (isPast) {
      suggestion = 'past';
    } else if (override?.paused) {
      suggestion = 'paused';
      daysSinceWeights += 1;
    } else {
      const hasExplicitShift = !!override && !override.isDayOff && !!override.shiftLetters && override.shiftLetters.length > 0;
      let policy: ShiftPolicy;

      if (hasExplicitShift) {
        const key = [...override!.shiftLetters!].sort().join('');
        policy = policyOverrides?.[key] || DEFAULT_SHIFT_POLICIES[key] || 'train';
        if (policy === 'restOrCardio' && daysSinceWeights >= restOverrideDays) {
          policy = 'train';
        }
      } else {
        // 沒登記，或明確標「休假」：交給每週目標次數
        policy = trainedThisWeek < weeklyTargetSessions ? 'train' : 'restOrCardio';
      }

      if (policy === 'train' && slots.length > 0) {
        suggestion = 'train';
        suggestedSlot = slots[simCursor % slots.length];
        simCursor += 1;
        daysSinceWeights = 0;
        if (!actualWorkout) {
          trainedThisWeek += 1;
        }
      } else {
        suggestion = activeProgram ? 'restOrCardio' : 'noProgram';
        daysSinceWeights += 1;
      }
    }

    plannedDays.push({
      dateStr,
      isPast,
      isToday,
      override,
      actualWorkout,
      suggestion,
      suggestedSlot,
    });
  }

  return plannedDays;
}

export interface CalendarCell {
  dateStr: string | null;
  dayNum: number | null;
}

export function buildCalendarGrid(currentMonth: Date): CalendarCell[] {
  const year = currentMonth.getFullYear();
  const month = currentMonth.getMonth();

  const firstDayIndex = new Date(year, month, 1).getDay(); // 0 是週日
  const totalDays = new Date(year, month + 1, 0).getDate();

  const cells: CalendarCell[] = [];

  // 前月空格填充
  for (let i = 0; i < firstDayIndex; i++) {
    cells.push({ dateStr: null, dayNum: null });
  }

  // 當月日期
  for (let day = 1; day <= totalDays; day++) {
    const mStr = (month + 1).toString().padStart(2, '0');
    const dStr = day.toString().padStart(2, '0');
    const dateStr = `${year}-${mStr}-${dStr}`;
    cells.push({ dateStr, dayNum: day });
  }

  return cells;
}

export function getValidDatesInRange(
  startStr: string,
  endStr: string,
  allCalendarDates: (string | null)[],
  todayDateStr: string
): string[] {
  const minDate = startStr < endStr ? startStr : endStr;
  const maxDate = startStr < endStr ? endStr : startStr;

  return allCalendarDates
    .filter((d): d is string => {
      if (!d) return false;
      return d >= minDate && d <= maxDate && d >= todayDateStr;
    });
}
