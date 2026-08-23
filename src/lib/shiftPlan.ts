import {
  type DayOverride,
  type ShiftPolicy,
  type TrainingProgram,
  type ProgramSlot,
  type Workout,
  type Exercise,
  type WorkoutTemplate,
  type MuscleGroup
} from '../db/schema';
import {
  type SplitCategory,
  SPLIT_CATEGORIES,
  classifySlotSplitCategory,
  classifyWorkoutSplitCategoryByExercises,
} from './splitRotation';

export type DayPlanSuggestion =
  | 'train' | 'restOrCardio' | 'cardio' | 'restOnly' | 'paused'
  | 'programPaused' | 'noProgram' | 'past';

export type SlotCategory = 'legs' | 'chestBack' | 'other';

const MAX_CONSECUTIVE_TRAIN_DAYS = 3;

export interface PlannedDay {
  dateStr: string;
  isPast: boolean;
  isToday: boolean;
  override: DayOverride | null;
  actualWorkout: Workout | null;      // 當天已有紀錄（completed 或 active）就帶進來；有值時 UI 顯示優先權高於 suggestion
  suggestion: DayPlanSuggestion;
  suggestedSlot: ProgramSlot | null;  // 只有 suggestion === 'train' 才有值
  pinConflict: boolean;               // 新增：這天有指定部位，但這一輪已經練過/找不到 slot，指定沒有生效
  pinConflictReason?: 'consumed' | 'consecutiveLimit' | 'removed'; // 衝突原因描述
}

export interface PlannedDayWithBaseline extends PlannedDay {
  baselineSuggestion: DayPlanSuggestion;
  baselineSuggestedSlot: ProgramSlot | null;
  diverged: boolean; // 原定 ≠ 實際，且不是過去日期，才算「有落差」
}

const DECISION_OVERRIDE_KEYS = ['paused', 'forcedRest', 'pinnedSlotId', 'pinnedOutcome'] as const;

// 「原定計畫」用：忽略使用者對訓練建議的主觀覆寫，只保留客觀的班別/休假事實
export function stripDecisionOverride(override: DayOverride): DayOverride {
  const next = { ...override };
  for (const key of DECISION_OVERRIDE_KEYS) {
    delete next[key];
  }
  return next;
}

export function buildBaselineOverridesByDate(
  overridesByDate: Map<string, DayOverride>
): Map<string, DayOverride> {
  const result = new Map<string, DayOverride>();
  for (const [dateStr, override] of overridesByDate) {
    result.set(dateStr, stripDecisionOverride(override));
  }
  return result;
}

export function describeSuggestionLabel(
  suggestion: DayPlanSuggestion,
  slot: ProgramSlot | null
): string {
  switch (suggestion) {
    case 'train': return slot ? slot.label : '訓練';
    case 'restOrCardio': return '休息/有氧';
    case 'cardio': return '建議有氧';
    case 'restOnly': return '休息';
    case 'paused': return '今日無法';
    case 'programPaused': return '計畫暫停中';
    case 'noProgram': return '尚未設定課表';
    case 'past': return '—';
  }
}

export function mergeBaselinePlan(
  actual: PlannedDay[],
  baseline: PlannedDay[]
): PlannedDayWithBaseline[] {
  const baselineByDate = new Map(baseline.map((d) => [d.dateStr, d]));
  return actual.map((day) => {
    const b = baselineByDate.get(day.dateStr);
    const baselineSuggestion = b?.suggestion ?? day.suggestion;
    const baselineSuggestedSlot = b?.suggestedSlot ?? day.suggestedSlot;
    const diverged =
      !day.isPast &&
      (baselineSuggestion !== day.suggestion ||
        baselineSuggestedSlot?.id !== day.suggestedSlot?.id);
    return { ...day, baselineSuggestion, baselineSuggestedSlot, diverged };
  });
}

export const DEFAULT_SHIFT_POLICIES: Record<string, ShiftPolicy[]> = {
  'DAYOFF': ['train'],
  'A': ['train'],
  'B': ['train'],
  'C': ['train'],
  'AB': ['train'],
  'AC': ['train'],
  'BC': ['train'],
  'ABC': ['rest'],
};

function resolvePolicies(
  key: string,
  policyOverrides: Record<string, ShiftPolicy[]> | undefined,
): ShiftPolicy[] {
  const raw = policyOverrides?.[key] || DEFAULT_SHIFT_POLICIES[key];
  return raw && raw.length > 0 ? raw : ['train'];
}

export function classifyShiftCode(
  override: DayOverride | null | undefined,
  policyOverrides: Record<string, ShiftPolicy[]> | undefined,
): ShiftPolicy[] {
  if (!override || override.isDayOff || !override.shiftLetters || override.shiftLetters.length === 0) {
    return resolvePolicies('DAYOFF', policyOverrides);
  }

  const key = [...override.shiftLetters].sort().join('');
  return resolvePolicies(key, policyOverrides);
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

export type ShiftCodeCategory =
  | 'A' | 'B' | 'C' | 'AB' | 'AC' | 'BC' | 'ABC' | 'dayoff' | 'unable';

export function classifyShiftCodeCategory(code: string): ShiftCodeCategory {
  if (code === 'A' || code === 'B' || code === 'C') return code;
  if (code === '休假') return 'dayoff';
  if (code === '今日無法' || code === '強制休息' || code === 'forcedRest') return 'unable';
  if (code === 'AB' || code === 'AC' || code === 'BC' || code === 'ABC') return code;
  return 'unable'; // 防禦性 fallback，理論上不會走到
}

export const SHIFT_CODE_EMOJI: Record<ShiftCodeCategory, string> = {
  A: '🌅', B: '☀️', C: '🌙',
  AB: '🌆', AC: '🔀', BC: '🌄', ABC: '🔥',
  dayoff: '🏖️', unable: '🚫',
};

// 月曆角落徽章用：比照 locationStyle.ts 的 getLocationColor 寫法，回傳 hex 直接進 inline style。
export const SHIFT_CODE_HEX: Record<ShiftCodeCategory, string> = {
  A: '#3b82f6',      // blue-500
  B: '#f59e0b',      // amber-500
  C: '#a855f7',       // purple-500
  AB: '#6366f1',   // indigo-500（剩晚上）
  AC: '#22c55e',   // green-500（剩下午）
  BC: '#eab308',   // yellow-500（剩早上）
  ABC: '#dc2626',  // red-600（整天沒空，用最強烈的顏色跟其他三個區分）
  dayoff: '#10b981',  // emerald-500
  unable: '#334155',  // slate-700
};

// 九宮格按鈕用：完整 Tailwind class 字面值查表
export const SHIFT_CODE_BUTTON_CLASSES: Record<ShiftCodeCategory, string> = {
  A: 'bg-blue-50 dark:bg-blue-950/40 border-blue-200 dark:border-blue-900 text-blue-600 dark:text-blue-400',
  B: 'bg-amber-50 dark:bg-amber-950/40 border-amber-200 dark:border-amber-900 text-amber-600 dark:text-amber-400',
  C: 'bg-purple-50 dark:bg-purple-950/40 border-purple-200 dark:border-purple-900 text-purple-600 dark:text-purple-400',
  AB: 'bg-indigo-50 dark:bg-indigo-950/40 border-indigo-200 dark:border-indigo-900 text-indigo-600 dark:text-indigo-400',
  AC: 'bg-green-50 dark:bg-green-950/40 border-green-200 dark:border-green-900 text-green-600 dark:text-green-400',
  BC: 'bg-yellow-50 dark:bg-yellow-950/40 border-yellow-200 dark:border-yellow-900 text-yellow-600 dark:text-yellow-400',
  ABC: 'bg-red-50 dark:bg-red-950/40 border-red-200 dark:border-red-900 text-red-600 dark:text-red-400',
  dayoff: 'bg-emerald-50 dark:bg-emerald-950/40 border-emerald-200 dark:border-emerald-900 text-emerald-600 dark:text-emerald-400',
  unable: 'bg-slate-100 dark:bg-slate-800 border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-300',
};

// 深色模式的卡片底色是 slate-900（藍灰色）。冷色系（藍/紫/靛/綠/青/翠綠）跟
// 這個底色本來就同一個色相家族，用 -950 這種極暗色階疊低透明度時，跟底色幾乎
// 混在一起看不出來（暖色系如黃/橘/紅因為色相差異大，低透明度也能一眼看出來，
// 不受影響）。冷色系一律改用較亮的 -700／-800 色階＋提高透明度，確保跟底色有
// 足夠的亮度落差；暖色系維持原本已經夠清楚的組合。
export const SHIFT_CODE_CELL_BG_CLASSES: Record<ShiftCodeCategory, string> = {
  A: 'bg-blue-50 dark:bg-blue-800/50',
  B: 'bg-amber-50 dark:bg-amber-950/30',
  C: 'bg-purple-50 dark:bg-purple-800/50',
  AB: 'bg-indigo-100 dark:bg-indigo-700/55',
  AC: 'bg-green-100 dark:bg-green-700/50',
  BC: 'bg-yellow-100 dark:bg-yellow-950/40',
  ABC: 'bg-red-100 dark:bg-red-950/40',
  dayoff: 'bg-emerald-50 dark:bg-emerald-800/45',
  unable: 'bg-slate-100 dark:bg-slate-700/60',
};

export function classifySlotCategory(
  slot: ProgramSlot,
  templatesById: Map<string, WorkoutTemplate>,
  exerciseMap: Map<string, Exercise>,
): SlotCategory {
  if (!slot.templateId) return 'other';
  const template = templatesById.get(slot.templateId);
  if (!template) return 'other';
  const groups = new Set<MuscleGroup>();
  for (const entry of template.entries) {
    const ex = exerciseMap.get(entry.exerciseId);
    if (ex) groups.add(ex.muscleGroup);
  }
  if (groups.has('腿臀')) return 'legs';
  if (groups.has('胸') || groups.has('背')) return 'chestBack';
  return 'other';
}

export interface GenerateMonthPlanInput {
  dateStrings: string[];              // 要顯示的整個月曆範圍（含當月已過去的日期），由小到大排序
  activeProgram: TrainingProgram | null;
  completedWorkouts: Workout[];       // listCompletedWorkouts() 的結果
  activeWorkoutToday: Workout | null; // 來自 useActiveWorkoutStore 的進行中訓練（還沒 complete，不在上面那個陣列裡）
  overridesByDate: Map<string, DayOverride>;
  policyOverrides: Record<string, ShiftPolicy[]> | undefined;
  restOverrideDays: number;
  exerciseMap: Map<string, Exercise>; // 判斷「是不是純有氧」用，buildExerciseMap() 建
  today: number;                      // Date.now()，測試時可以注入固定時間
  weeklyTargetSessions?: number;       // 新增：settings?.weeklyTargetSessions ?? 4
  templatesById: Map<string, WorkoutTemplate>;  // 新增：listTemplates() 建的 id→WorkoutTemplate 表
  programPaused?: boolean;            // 整份計畫是否暫停中（跟單日 override?.paused 是不同維度）
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
    templatesById,
    programPaused = false,
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

  const completedSlotIdsThisLap = activeProgram?.completedSlotIdsThisLap ?? [];
  const pool = new Set<string>(
    activeProgram
      ? activeProgram.slots
          .filter(s => !completedSlotIdsThisLap.includes(s.id))
          .map(s => s.id)
      : []
  );

  function pickDefaultFromPool(): ProgramSlot | null {
    if (!activeProgram) return null;
    for (const s of activeProgram.slots) {
      if (pool.has(s.id)) return s;
    }
    return null;
  }

  const slots = activeProgram ? activeProgram.slots : [];
  const slotCategories = slots.map(s => classifySlotCategory(s, templatesById, exerciseMap));
  const allOther = slotCategories.every(cat => cat === 'other');

  // 拉/推/腿/手 輪替：課表裡實際涵蓋到的分類才需要被「太久沒練」規則盯著，
  // 課表根本沒有的分類（例如只練三分化，沒有手臂日）不強制。
  const categoriesInProgram = new Set<SplitCategory>();
  for (const s of slots) {
    const cat = classifySlotSplitCategory(s, templatesById, exerciseMap);
    if (cat) categoriesInProgram.add(cat);
  }

  function pickFromPoolByCategory(category: SplitCategory): ProgramSlot | null {
    if (!activeProgram) return null;
    for (const s of activeProgram.slots) {
      if (pool.has(s.id) && classifySlotSplitCategory(s, templatesById, exerciseMap) === category) return s;
    }
    return null;
  }

  // 每個分類距上次訓練幾天：用真實歷史紀錄（不受月曆顯示範圍侷限）算出「以今天為基準」的起始值；
  // 從未練過該分類的，先當作剛歸零（0），不要一開始就判定成逃逸值，避免舊資料/新分類在上線
  // 第一天就被誤判成全部超過門檻、瞬間強制排滿。
  const daysSinceCategory: Record<SplitCategory, number> = { '拉': 0, '推': 0, '腿': 0, '手': 0 };
  for (const cat of SPLIT_CATEGORIES) {
    let maxStartedAt = 0;
    for (const w of completedWorkouts) {
      if (w.deletedAt) continue;
      if (classifyWorkoutSplitCategoryByExercises(w, exerciseMap) !== cat) continue;
      if (w.startedAt > maxStartedAt) maxStartedAt = w.startedAt;
    }
    if (maxStartedAt > 0) {
      daysSinceCategory[cat] = getCalendarDaysDiff(getLocalDateStr(maxStartedAt), todayStr);
    }
  }

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

  let consecutiveTrainDays = 0;
  let yesterdayWasLegsTrain = false;
  let effectiveWeeklyTarget = weeklyTargetSessions;

  for (const dateStr of dateStrings) {
    const weekStart = getWeekStart(dateStr);
    if (weekStart !== currentWeekStart) {
      currentWeekStart = weekStart;
      trainedThisWeek = 0;
      effectiveWeeklyTarget = weeklyTargetSessions;
    }

    const isPast = dateStr < todayStr;
    const isToday = dateStr === todayStr;
    const override = overridesByDate.get(dateStr) || null;
    const actualWorkout = completedByDate.get(dateStr) || (isToday ? activeToday : null);

    if (actualWorkout) {
      trainedThisWeek += 1; // 不管過去或今天，有實際紀錄就算這週練過一次
    }

    const upcomingSlot = pickDefaultFromPool();
    const upcomingCategory = upcomingSlot ? classifySlotCategory(upcomingSlot, templatesById, exerciseMap) : 'other';

    // nextCategory（規則 a 用，「明天是不是腿日」）：模擬「今天消耗掉 upcomingSlot 後，剩下池子的下一個」
    const dryRunPool = new Set<string>(pool);
    if (upcomingSlot) {
      dryRunPool.delete(upcomingSlot.id);
      if (dryRunPool.size === 0 && activeProgram) {
        for (const s of activeProgram.slots) dryRunPool.add(s.id);
      }
    }
    const pickNextFromDryRunPool = (): ProgramSlot | null => {
      if (!activeProgram) return null;
      for (const s of activeProgram.slots) {
        if (dryRunPool.has(s.id)) return s;
      }
      return null;
    };
    const nextSlot = pickNextFromDryRunPool();
    const nextCategory = nextSlot ? classifySlotCategory(nextSlot, templatesById, exerciseMap) : 'other';

    let suggestion: DayPlanSuggestion;
    let suggestedSlot: ProgramSlot | null = null;
    let pinConflict = false;
    let pinConflictReason: 'consumed' | 'consecutiveLimit' | 'removed' | undefined;

    if (isPast) {
      suggestion = 'past';
    } else if (programPaused) {
      suggestion = 'programPaused';
      for (const cat of SPLIT_CATEGORIES) daysSinceCategory[cat] += 1;
      consecutiveTrainDays = 0;
      yesterdayWasLegsTrain = false;
      // 刻意不動 trainedThisWeek 與 effectiveWeeklyTarget：暫停期間沒有週目標可言，
      // 不必像 forcedRest 那樣扣抵配額。
    } else if (override?.paused || override?.forcedRest) {
      suggestion = 'paused';
      for (const cat of SPLIT_CATEGORIES) daysSinceCategory[cat] += 1;
      consecutiveTrainDays = 0;
      yesterdayWasLegsTrain = false;
      effectiveWeeklyTarget = Math.max(0, effectiveWeeklyTarget - 1);
    } else {
      const hasExplicitShift = !!override && !override.isDayOff && !!override.shiftLetters && override.shiftLetters.length > 0;
      let wantsTrain: boolean;
      let resolvedPinSlot: ProgramSlot | null = null;
      // 班別政策直接指定「有氧」或「休息」時（新版三選一，不再自動用「明天是不是腿日」去猜）
      let pinnedShiftSuggestion: 'cardio' | 'restOnly' | null = null;

      // 解析今天的班別政策（可複選）；非明確排班（休假/無設定）比照 DAYOFF 預設全開可訓練
      const shiftKey = hasExplicitShift ? [...override!.shiftLetters!].sort().join('') : 'DAYOFF';
      const shiftPolicies = resolvePolicies(shiftKey, policyOverrides);
      const shiftAllowsTrain = shiftPolicies.includes('train');
      const shiftAllowsCardio = shiftPolicies.includes('cardio');
      const shiftAllowsRest = shiftPolicies.includes('rest');
      // 複選時，「安排訓練」有勾就照下面配額/節奏邏輯正常判斷今天要不要練；
      // 沒有要練（或根本沒勾「安排訓練」）時，才在有勾的選項裡照優先序（有氧 > 休息）挑一個定案
      const pickNonTrainOutcome = (): 'cardio' | 'restOnly' | null =>
        shiftAllowsCardio ? 'cardio' : shiftAllowsRest ? 'restOnly' : null;

      if (override?.pinnedSlotId && activeProgram) {
        const candidate = activeProgram.slots.find(s => s.id === override.pinnedSlotId);
        if (candidate) {
          if (pool.has(candidate.id)) {
            resolvedPinSlot = candidate;
          } else {
            pinConflict = true;
            pinConflictReason = 'consumed';
          }
        } else {
          pinConflict = true;
          pinConflictReason = 'removed';
        }
      }

      const [y, m, d] = dateStr.split('-').map(Number);
      const dow = new Date(y, m - 1, d).getDay();
      const daysLeftInWeek = 7 - dow; // 含今天
      const remainingQuota = effectiveWeeklyTarget - trainedThisWeek;
      const urgent = remainingQuota >= daysLeftInWeek; // 剩下的天數已經不夠湊到目標，沒有選擇餘地

      // 規則 d：拉/推/腿/手任一分類距上次訓練達門檻天數，強制排入該分類——
      // 優先度僅次於使用者當天親自指定（pinnedOutcome／指定部位），連班別建議的休息/有氧、
      // 週目標已達成都能推翻。多個分類同時逾期時，挑等最久的那個。
      // 但只在這天的班別政策有勾「安排訓練」時才會觸發：使用者明確把某班別設成
      // 只休息／只有氧，就是刻意表示這個班別不排訓練，這個意願不該被悄悄推翻。
      let forcedCategory: SplitCategory | null = null;
      if (!override?.pinnedOutcome && !resolvedPinSlot && shiftAllowsTrain) {
        let maxGap = -1;
        for (const cat of SPLIT_CATEGORIES) {
          if (!categoriesInProgram.has(cat)) continue;
          if (daysSinceCategory[cat] >= restOverrideDays && daysSinceCategory[cat] > maxGap) {
            maxGap = daysSinceCategory[cat];
            forcedCategory = cat;
          }
        }
      }

      if (override?.pinnedOutcome) {
        // 指定當天就是休息或有氧，不進訓練池、不看班別/週目標，直接定案
        wantsTrain = false;
      } else if (resolvedPinSlot) {
        wantsTrain = true;
      } else if (hasExplicitShift) {
        if (!shiftAllowsTrain) {
          wantsTrain = false;
          pinnedShiftSuggestion = pickNonTrainOutcome();
        } else if (remainingQuota <= 0) {
          wantsTrain = false; // 這週目標已達成，班別允許練不代表要練，讓訓練自然分散
          pinnedShiftSuggestion = pickNonTrainOutcome();
        } else if (urgent) {
          wantsTrain = true; // 剩餘天數已經不夠湊到目標，沒有選擇餘地
        } else {
          // 有餘裕時偏好隔一天再練，避免班別連續好幾天都能練，把訓練擠成一坨
          wantsTrain = consecutiveTrainDays === 0;
          if (!wantsTrain) pinnedShiftSuggestion = pickNonTrainOutcome();
        }
      } else if (remainingQuota <= 0) {
        wantsTrain = false;
      } else if (urgent) {
        wantsTrain = true; // 週目標急迫性：沒有選擇餘地，優先於 a/c
      } else if (allOther) {
        wantsTrain = true; // 退化成 Phase 23 運作：所有 slots 均為 'other' 時，直接建議訓練
      } else {
        // 規則 c：有餘裕時只挑推/拉（胸背相關），腿/手先讓路、遞延到 urgent 時才消耗
        wantsTrain = upcomingCategory === 'chestBack';
        // 規則 a：不急迫時，腿日前後盡量避開
        if (wantsTrain && (nextCategory === 'legs' || yesterdayWasLegsTrain)) {
          wantsTrain = false;
        }
      }

      if (forcedCategory) {
        wantsTrain = true;
      }

      // 規則 b：連續訓練天數硬上限，優先度最高，連明確排班都能推翻，也連「指定部位」都推翻
      if (wantsTrain && consecutiveTrainDays >= MAX_CONSECUTIVE_TRAIN_DAYS) {
        wantsTrain = false;
        if (resolvedPinSlot) {
          pinConflict = true;
          pinConflictReason = 'consecutiveLimit';
        }
      }

      if (wantsTrain && slots.length > 0) {
        suggestion = 'train';
        suggestedSlot = resolvedPinSlot ?? (forcedCategory ? pickFromPoolByCategory(forcedCategory) : null) ?? pickDefaultFromPool();
        if (suggestedSlot) {
          pool.delete(suggestedSlot.id);
          if (pool.size === 0) {
            // 模擬「這一輪跑滿了」：補滿下一輪的池子。純模擬用，不影響真正的 activeProgram.cycleCount
            for (const s of activeProgram!.slots) pool.add(s.id);
          }
        }
        const suggestedCategory = suggestedSlot ? classifySlotCategory(suggestedSlot, templatesById, exerciseMap) : 'other';
        const suggestedSplitCategory = suggestedSlot ? classifySlotSplitCategory(suggestedSlot, templatesById, exerciseMap) : null;
        yesterdayWasLegsTrain = suggestedCategory === 'legs';
        for (const cat of SPLIT_CATEGORIES) {
          daysSinceCategory[cat] = cat === suggestedSplitCategory ? 0 : daysSinceCategory[cat] + 1;
        }
        consecutiveTrainDays += 1;
        if (!actualWorkout) trainedThisWeek += 1;
      } else {
        consecutiveTrainDays = 0;
        yesterdayWasLegsTrain = false;
        if (override?.pinnedOutcome === 'cardio') {
          suggestion = 'cardio';
        } else if (override?.pinnedOutcome === 'rest') {
          suggestion = 'restOrCardio';
        } else if (pinnedShiftSuggestion) {
          suggestion = pinnedShiftSuggestion;
        } else if (activeProgram) {
          suggestion = upcomingCategory === 'legs' ? 'cardio' : 'restOrCardio';
        } else {
          suggestion = 'noProgram';
        }
        for (const cat of SPLIT_CATEGORIES) daysSinceCategory[cat] += 1;
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
      pinConflict,
      pinConflictReason,
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
