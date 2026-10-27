import {
  type Workout,
  type TrainingProgram,
  type WorkoutTemplate,
  type TemplateCategory,
  type ProgramSlot,
  type Exercise,
  type MuscleGroup,
} from '../db/schema';

// 單一部位日（輪替提醒、肌群多數決都只認這四類）
export type PartCategory = '拉' | '推' | '腿' | '手';
export const PART_CATEGORIES: PartCategory[] = ['拉', '推', '腿', '手'];

// 複合日：胸背＝推＋拉、腿手＝腿＋手、有氧核心＝有氧搭核心動作。月統計各算獨立一格，不拆回單一部位。
export type ComboCategory = '胸背' | '腿手' | '有氧核心';
export const COMBO_CATEGORIES: ComboCategory[] = ['胸背', '腿手', '有氧核心'];

// 訓練實際歸類（日曆、歷史、月統計）：單一部位＋複合日＋純有氧（整次訓練都是有氧動作）
export type SplitCategory = PartCategory | ComboCategory | '純有氧';
export const SPLIT_CATEGORIES: SplitCategory[] = [...PART_CATEGORIES, ...COMBO_CATEGORIES, '純有氧'];

/** 複合日在輪替提醒裡等於同時練了哪幾個單一部位 */
const COMBO_PARTS: Partial<Record<SplitCategory, PartCategory[]>> = {
  胸背: ['推', '拉'],
  腿手: ['腿', '手'],
};

// 不同訓練類別要用不同顏色一眼區分（日曆圖例、歷史頁圖表的色塊）。刻意避開 locationStyle.ts
// 已經用掉的藍/紅（中壢建工/楊梅WG），不然同一格「地點小圓點」跟「類別」撞色會混淆。
// 2026-10-02 歷史頁加圖表時用 dataviz 色盤檢查器驗過（淺色白底、深色 slate-900 底，四色兩兩比）：
// 原本的 cyan-500 跟 emerald-500 一般視覺就分不太出來，手改 sky-600、其他各取一階較深的，四色在兩種主題都過。
export const SPLIT_CATEGORY_HEX: Record<SplitCategory, string> = {
  拉: '#059669', // emerald-600
  推: '#d97706', // amber-600
  腿: '#8b5cf6', // violet-500
  手: '#0284c7', // sky-600
  胸背: '#e11d48', // rose-600
  腿手: '#c026d3', // fuchsia-600
  有氧核心: '#0f766e', // teal-700
  純有氧: '#65a30d', // lime-600
};

// 日曆格子「整格底色」用（比純文字上色明顯很多，深色/淺色主題都要夠清楚，
// 所以走跟 shiftPlan.ts 的 SHIFT_CODE_CELL_BG_CLASSES 同一套寫法：淺色主題用淡色調 -100，
// 深色主題用半透明的 -800/50，色相對齊 SPLIT_CATEGORY_HEX）。
// ⚠️ Tailwind 只認靜態 class 字串，不可動態拼接。
export const SPLIT_CATEGORY_CELL_BG_CLASSES: Record<SplitCategory, string> = {
  拉: 'bg-emerald-100 dark:bg-emerald-800/50',
  推: 'bg-amber-100 dark:bg-amber-800/50',
  腿: 'bg-violet-100 dark:bg-violet-800/50',
  手: 'bg-sky-100 dark:bg-sky-800/50',
  胸背: 'bg-rose-100 dark:bg-rose-800/50',
  腿手: 'bg-fuchsia-100 dark:bg-fuchsia-800/50',
  有氧核心: 'bg-teal-100 dark:bg-teal-800/50',
  純有氧: 'bg-lime-100 dark:bg-lime-800/50',
};

/** 把 slot label 或訓練標題正規化成 SplitCategory 之一；判不出來回 null */
export function normalizeSplit(text: string | undefined): SplitCategory | null {
  if (!text) return null;
  const lower = text.toLowerCase();

  // 0. 複合日要先認，不然「胸背」會被當成拉（含「背」）、「腿手」會被當成腿（含「腿」）
  if (lower.includes('有氧') && lower.includes('核心')) return '有氧核心';
  if (lower.includes('胸背') || (lower.includes('胸') && lower.includes('背'))) return '胸背';
  if (
    lower.includes('腿手') ||
    (lower.includes('腿') && (lower.includes('手') || lower.includes('二頭') || lower.includes('三頭')))
  ) {
    return '腿手';
  }

  // 1. 腿 (Leg, 臀, 深蹲)
  if (lower.includes('腿') || lower.includes('leg') || lower.includes('臀') || lower.includes('深蹲')) {
    return '腿';
  }
  // 2. 拉 (Pull, 背)
  if (lower.includes('拉') || lower.includes('pull') || lower.includes('背')) {
    return '拉';
  }
  // 3. 推 (Push, 胸, 肩)
  if (lower.includes('推') || lower.includes('push') || lower.includes('胸') || lower.includes('肩')) {
    return '推';
  }
  // 4. 手 (Arm, 二頭, 三頭)
  if (lower.includes('手') || lower.includes('arm') || lower.includes('二頭') || lower.includes('三頭')) {
    return '手';
  }
  // 5. 有氧（含核心的上面已先判成有氧核心）
  if (lower.includes('有氧')) return '純有氧';

  return null;
}

/** 這個類別對應到哪幾個單一部位（單一部位＝自己、胸背＝推＋拉、腿手＝腿＋手、有氧類＝空） */
export function getPartsOf(category: SplitCategory): PartCategory[] {
  const combo = COMBO_PARTS[category];
  if (combo) return combo;
  return PART_CATEGORIES.includes(category as PartCategory) ? [category as PartCategory] : [];
}

/** SplitCategory → 範本分類；純有氧不是範本分類（有氧範本走獨立清單），回 undefined */
export function toTemplateCategory(category: SplitCategory | null): TemplateCategory | undefined {
  return category && category !== '純有氧' ? category : undefined;
}

/** 純有氧／有氧核心要看動作才分得出來；其他類別看動作判不出來（回 null），交給文字比對 */
export function classifyCardioByExercises(
  workout: Workout,
  exerciseMap: Map<string, Exercise>,
): '純有氧' | '有氧核心' | null {
  let cardio = 0;
  let core = 0;
  for (const entry of workout.entries) {
    const mg = exerciseMap.get(entry.exerciseId)?.muscleGroup;
    if (!mg) return null;
    if (mg === '有氧') cardio += 1;
    else if (mg === '核心') core += 1;
    else return null;
  }
  if (cardio === 0) return null;
  return core > 0 ? '有氧核心' : '純有氧';
}

export function getWorkoutSplitCategory(
  workout: Workout,
  program: TrainingProgram | null,
  exerciseMap?: Map<string, Exercise>,
): SplitCategory | null {
  // 有給動作表時，整次都是有氧（或有氧＋核心）直接以動作為準，不看標題
  if (exerciseMap) {
    const byExercises = classifyCardioByExercises(workout, exerciseMap);
    if (byExercises) return byExercises;
  }
  // Fallback 1: Slot label
  if (workout.programSlotId && program) {
    const slot = program.slots.find(s => s.id === workout.programSlotId);
    if (slot) {
      const category = normalizeSplit(slot.label);
      if (category) return category;
    }
  }
  // Fallback 2: title
  if (workout.title) {
    const category = normalizeSplit(workout.title);
    if (category) return category;
  }
  return null;
}

export interface SplitStatus {
  category: PartCategory;
  lastTrainedAt: number | null;   // 最近一次該類訓練的 startedAt
  daysAgo: number | null;         // 距今幾天（無紀錄為 null）
  doneInWindow: boolean;          // 滾動 7 天內是否練過
}

function getStartOfDay(timestamp: number): number {
  const date = new Date(timestamp);
  date.setHours(0, 0, 0, 0);
  return date.getTime();
}

/** 相差幾個「日曆天」（不是 24 小時整除，跨午夜就算一天） */
export function getCalendarDaysAgo(startedAt: number, now: number): number {
  const startOfTrained = getStartOfDay(startedAt);
  const startOfNow = getStartOfDay(now);
  const diffMs = startOfNow - startOfTrained;
  return Math.round(diffMs / (24 * 60 * 60 * 1000));
}

export function getSplitRotationStatus(
  workouts: Workout[],          // 已完成的訓練
  program: TrainingProgram | null,
  now: number,
  windowDays = 7,
): SplitStatus[] {
  const statuses: Record<PartCategory, SplitStatus> = {
    '拉': { category: '拉', lastTrainedAt: null, daysAgo: null, doneInWindow: false },
    '推': { category: '推', lastTrainedAt: null, daysAgo: null, doneInWindow: false },
    '腿': { category: '腿', lastTrainedAt: null, daysAgo: null, doneInWindow: false },
    '手': { category: '手', lastTrainedAt: null, daysAgo: null, doneInWindow: false },
  };

  const windowMs = windowDays * 24 * 60 * 60 * 1000;
  const since = now - windowMs;

  for (const workout of workouts) {
    if (workout.deletedAt) continue;

    const category = getWorkoutSplitCategory(workout, program);
    if (!category) continue;

    if (workout.startedAt > now) continue;
    for (const part of getPartsOf(category)) {
      const current = statuses[part];
      if (current.lastTrainedAt === null || workout.startedAt > current.lastTrainedAt) {
        current.lastTrainedAt = workout.startedAt;
        current.daysAgo = getCalendarDaysAgo(workout.startedAt, now);
      }
      if (workout.startedAt > since) {
        current.doneInWindow = true;
      }
    }
  }

  return PART_CATEGORIES.map(cat => statuses[cat]);
}

/** 統計某年某月（本地時區，month 為 1-12）各分類實際完成的訓練次數 */
export function getMonthlySplitCounts(
  workouts: Workout[],
  program: TrainingProgram | null,
  year: number,
  month: number,
  exerciseMap?: Map<string, Exercise>,
): Record<SplitCategory, number> {
  const counts = Object.fromEntries(SPLIT_CATEGORIES.map((c) => [c, 0])) as Record<SplitCategory, number>;
  for (const workout of workouts) {
    if (workout.deletedAt) continue;
    const started = new Date(workout.startedAt);
    if (started.getFullYear() !== year || started.getMonth() + 1 !== month) continue;
    const category = getWorkoutSplitCategory(workout, program, exerciseMap);
    if (category) counts[category] += 1;
  }
  return counts;
}

/** 肌群 -> 拉/推/腿/手 四分類；核心、有氧判不出來歸屬哪個分化，回 null */
function muscleGroupToSplit(group: MuscleGroup): PartCategory | null {
  switch (group) {
    case '腿臀': return '腿';
    case '背': return '拉';
    case '胸':
    case '肩': return '推';
    case '手臂': return '手';
    default: return null;
  }
}

/**
 * ProgramSlot 的分化分類：優先看 label 文字（例：'腿臀日'），判不出來才退而求其次，
 * 用對應範本裡出現次數最多的肌群歸類；兩者都判不出來回 null（例如純核心/有氧的 slot）。
 */
export function classifySlotSplitCategory(
  slot: ProgramSlot,
  templatesById: Map<string, WorkoutTemplate>,
  exerciseMap: Map<string, Exercise>,
): SplitCategory | null {
  const fromLabel = normalizeSplit(slot.label);
  if (fromLabel) return fromLabel;
  if (!slot.templateId) return null;
  const template = templatesById.get(slot.templateId);
  if (!template) return null;
  const counts: Record<PartCategory, number> = { '拉': 0, '推': 0, '腿': 0, '手': 0 };
  for (const entry of template.entries) {
    const ex = exerciseMap.get(entry.exerciseId);
    if (!ex) continue;
    const cat = muscleGroupToSplit(ex.muscleGroup);
    if (cat) counts[cat] += 1;
  }
  let best: PartCategory | null = null;
  let bestCount = 0;
  for (const cat of PART_CATEGORIES) {
    if (counts[cat] > bestCount) {
      best = cat;
      bestCount = counts[cat];
    }
  }
  return best;
}

/**
 * 已完成訓練的分化分類：直接看這次訓練實際做了哪些動作的肌群（多數決），
 * 不像 getWorkoutSplitCategory 那樣依賴 slot label／訓練標題文字比對——
 * 排課演算法要能對「沒掛 slot、沒填標題」的隨手訓練一樣正確判斷分類。
 */
export function classifyWorkoutSplitCategoryByExercises(
  workout: Workout,
  exerciseMap: Map<string, Exercise>,
): PartCategory | null {
  const counts: Record<PartCategory, number> = { '拉': 0, '推': 0, '腿': 0, '手': 0 };
  for (const entry of workout.entries) {
    const ex = exerciseMap.get(entry.exerciseId);
    if (!ex) continue;
    const cat = muscleGroupToSplit(ex.muscleGroup);
    if (cat) counts[cat] += 1;
  }
  let best: PartCategory | null = null;
  let bestCount = 0;
  for (const cat of PART_CATEGORIES) {
    if (counts[cat] > bestCount) {
      best = cat;
      bestCount = counts[cat];
    }
  }
  return best;
}

// ---- 訓練範本分類：單一部位四類＋複合日三類，另加「自訂」接住判不出來的（純有氧範本另有有氧清單，不在這） ----
export const TEMPLATE_CATEGORIES: TemplateCategory[] = [...PART_CATEGORIES, ...COMBO_CATEGORIES, '自訂'];

/** 範本的「有效分類」：手動指定優先，沒指定才用名稱推斷，判不出來落在自訂 */
export function getTemplateCategory(
  template: Pick<WorkoutTemplate, 'name' | 'category'>
): TemplateCategory {
  if (template.category) return template.category;
  const inferred = normalizeSplit(template.name);
  // 範本分類沒有「純有氧」（有氧範本走獨立清單）
  return inferred && inferred !== '純有氧' ? inferred : '自訂';
}

/**
 * 依有效分類分組，5 個 key 一律都存在（沒有該分類就是空陣列，不是 undefined）。
 * 維持傳入陣列的原始順序（呼叫端負責先排好序、先濾掉有氧），這裡不重新排序。
 */
export function groupTemplatesByCategory(
  templates: WorkoutTemplate[]
): Record<TemplateCategory, WorkoutTemplate[]> {
  const grouped: Record<TemplateCategory, WorkoutTemplate[]> = {
    '拉': [],
    '推': [],
    '腿': [],
    '手': [],
    '胸背': [],
    '腿手': [],
    '有氧核心': [],
    '自訂': [],
  };
  for (const template of templates) {
    grouped[getTemplateCategory(template)].push(template);
  }
  return grouped;
}
