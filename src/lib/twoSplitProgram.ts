import {
  db,
  type Equipment,
  type Exercise,
  type MuscleGroup,
  type SetLog,
  type TemplateCategory,
  type TrainingProgram,
  type Workout,
  type WorkoutEntry,
  type WorkoutTemplate,
} from '../db/schema';
import { addExercise, listExercises } from '../db/exercises';
import { saveTemplate } from '../db/templates';
import { listCompletedWorkouts } from '../db/workouts';
import { saveProgram } from '../db/programs';
import { getWorkoutSplitCategory, type SplitCategory } from './splitRotation';
import { pickOwnComboSlotId } from './programLifecycle';

/**
 * 「胸背／腿手」二分化循環課表（2026-10-27）。
 * 四格輪替：胸背 A（重）→ 腿手 A（重）→ 胸背 B（輕）→ 腿手 B（輕）。
 * 排課邏輯是「這一輪沒練的格子裡挑最久沒練的」，所以自然變成 A、A、B、B 一直循環；
 * 休息日仍由班表／每週目標次數決定。菜單內容依 NSCA《Essentials》第 17 章與使用者逐項確認的版本。
 */
export const TWO_SPLIT_PROGRAM_NAME = '胸背／腿手 二分化循環';
const PROGRAM_ID = 'program-twosplit-v1';

interface EntrySpec {
  name: string;
  muscleGroup: MuscleGroup;
  equipment: Equipment;
  /** 替代動作（跟主動作同樣組數、次數） */
  alt?: string;
  sets: number;
  reps: number;
  restSeconds: number;
}

interface DaySpec {
  key: string;
  label: string;
  category: TemplateCategory;
  entries: EntrySpec[];
}

const e = (
  name: string,
  muscleGroup: MuscleGroup,
  equipment: Equipment,
  sets: number,
  reps: number,
  restSeconds: number,
  alt?: string,
): EntrySpec => ({ name, muscleGroup, equipment, sets, reps, restSeconds, alt });

export const TWO_SPLIT_DAYS: DaySpec[] = [
  {
    key: 'cb-a',
    label: '胸背 A（重）',
    category: '胸背',
    entries: [
      e('槓鈴臥推', '胸', '槓鈴', 4, 8, 150),
      e('引體向上', '背', '徒手', 4, 8, 150, '滑輪下拉（寬握）'),
      e('上斜啞鈴臥推', '胸', '啞鈴', 4, 10, 90),
      e('坐姿划船（窄握）', '背', '纜繩', 4, 10, 90),
      e('反向飛鳥', '肩', '機械', 3, 15, 60),
      e('雙槓臂屈伸（胸）', '胸', '徒手', 3, 10, 90),
    ],
  },
  {
    key: 'la-a',
    label: '腿手 A（重）',
    category: '腿手',
    entries: [
      e('槓鈴深蹲', '腿臀', '槓鈴', 4, 8, 180, '腿推'),
      e('羅馬尼亞硬舉', '腿臀', '槓鈴', 4, 8, 120),
      e('槓鈴臀推', '腿臀', '槓鈴', 4, 10, 90),
      e('啞鈴肩推', '肩', '啞鈴', 4, 10, 90),
      e('腿後勾', '腿臀', '機械', 3, 12, 90),
      e('站姿提踵', '腿臀', '機械', 3, 15, 60),
      e('啞鈴側平舉', '肩', '啞鈴', 2, 15, 60),
      e('啞鈴彎舉', '手臂', '啞鈴', 2, 10, 60),
      e('纜繩下壓（繩索）', '手臂', '纜繩', 2, 10, 60),
    ],
  },
  {
    key: 'cb-b',
    label: '胸背 B（輕）',
    category: '胸背',
    entries: [
      e('槓鈴臥推', '胸', '槓鈴', 4, 12, 90),
      e('引體向上', '背', '徒手', 4, 12, 90, '滑輪下拉（寬握）'),
      e('上斜啞鈴臥推', '胸', '啞鈴', 4, 12, 90),
      e('坐姿划船（窄握）', '背', '纜繩', 4, 12, 90),
      e('反向飛鳥', '肩', '機械', 3, 15, 60),
      e('雙槓臂屈伸（胸）', '胸', '徒手', 3, 12, 90),
    ],
  },
  {
    key: 'la-b',
    label: '腿手 B（輕）',
    category: '腿手',
    entries: [
      e('槓鈴深蹲', '腿臀', '槓鈴', 4, 10, 120, '腿推'),
      e('羅馬尼亞硬舉', '腿臀', '槓鈴', 4, 10, 90),
      e('槓鈴臀推', '腿臀', '槓鈴', 4, 12, 90),
      e('啞鈴肩推', '肩', '啞鈴', 4, 12, 90),
      e('啞鈴側平舉', '肩', '啞鈴', 2, 15, 60),
      e('啞鈴彎舉', '手臂', '啞鈴', 2, 12, 60),
      e('纜繩下壓（繩索）', '手臂', '纜繩', 2, 12, 60),
    ],
  },
];

const templateIdOf = (key: string) => `tpl-twosplit-${key}`;
const slotIdOf = (key: string) => `slot-twosplit-${key}`;

function plannedSets(count: number, reps: number, now: number): SetLog[] {
  return Array.from({ length: count }, () => ({
    id: crypto.randomUUID(),
    weight: 0,
    reps,
    isWarmup: false,
    completed: false,
    createdAt: now,
  }));
}

/** 純函式：由「動作名稱 → id」查表產生四份範本（id 固定，重複套用會覆蓋同一份而不是長出新的） */
export function buildTwoSplitTemplates(nameToId: Map<string, string>, now: number): WorkoutTemplate[] {
  return TWO_SPLIT_DAYS.map((day) => ({
    id: templateIdOf(day.key),
    name: day.label,
    category: day.category,
    entries: day.entries.map((spec, order): WorkoutEntry => {
      const exerciseId = nameToId.get(spec.name)!;
      const altId = spec.alt ? nameToId.get(spec.alt) : undefined;
      return {
        id: crypto.randomUUID(),
        exerciseId,
        ...(altId ? { candidateExerciseIds: [exerciseId, altId] } : {}),
        order,
        sets: plannedSets(spec.sets, spec.reps, now),
        defaultRestSeconds: spec.restSeconds,
      };
    }),
    createdAt: now,
    updatedAt: now,
  }));
}

export function buildTwoSplitProgram(now: number): TrainingProgram {
  return {
    id: PROGRAM_ID,
    name: TWO_SPLIT_PROGRAM_NAME,
    slots: TWO_SPLIT_DAYS.map((d) => ({ id: slotIdOf(d.key), label: d.label, templateId: templateIdOf(d.key) })),
    completedSlotIdsThisLap: [],
    cycleCount: 0,
    estimatedWeeks: { min: 8, max: 12 },
    status: 'active',
    startedAt: now,
    createdAt: now,
    updatedAt: now,
    runNumber: 1,
  };
}

/**
 * 沒有 title／標題判不出來時，看動作肌群猜複合日：
 * 胸＋背兩邊都有且合佔六成以上 → 胸背；腿臀搭肩／手臂且三者合佔八成以上 → 腿手。
 */
export function guessComboByExercises(workout: Workout, exerciseMap: Map<string, Exercise>): SplitCategory | null {
  const counts: Partial<Record<MuscleGroup, number>> = {};
  let total = 0;
  for (const entry of workout.entries) {
    const mg = exerciseMap.get(entry.exerciseId)?.muscleGroup;
    if (!mg) continue;
    counts[mg] = (counts[mg] ?? 0) + 1;
    total += 1;
  }
  if (total === 0) return null;
  const n = (mg: MuscleGroup) => counts[mg] ?? 0;
  if (n('胸') > 0 && n('背') > 0 && (n('胸') + n('背')) / total >= 0.6) return '胸背';
  const upper = n('肩') + n('手臂');
  if (n('腿臀') > 0 && upper > 0 && (n('腿臀') + upper) / total >= 0.8) return '腿手';
  return null;
}

/**
 * 套用課表當下，把「今天（since 之後）已經練過」的胸背／腿手算進這一輪：
 * 對應那一格標成已練；還沒掛任何計畫的那筆訓練補上計畫、格子與輪數（之後刪除才找得到要退哪格）。
 * 已經掛著舊計畫的訓練不動它的欄位（舊計畫的歷史照舊），只消耗新課表的格子。
 */
export function backfillTodayWorkouts(
  program: TrainingProgram,
  workouts: Workout[],
  exerciseMap: Map<string, Exercise>,
  since: number,
): { program: TrainingProgram; updatedWorkouts: Workout[] } {
  let current = program;
  const updatedWorkouts: Workout[] = [];
  const todays = workouts
    .filter((w) => !w.deletedAt && w.status === 'completed' && w.startedAt >= since)
    .sort((a, b) => a.startedAt - b.startedAt);

  for (const w of todays) {
    const category = getWorkoutSplitCategory(w, current, exerciseMap) ?? guessComboByExercises(w, exerciseMap);
    const slotId = pickOwnComboSlotId(current, category);
    if (!slotId) continue;
    current = { ...current, completedSlotIdsThisLap: [...current.completedSlotIdsThisLap, slotId] };
    if (!w.programId) {
      updatedWorkouts.push({ ...w, programId: current.id, programSlotId: slotId, programCycleNumber: current.cycleCount + 1 });
    }
  }
  return { program: current, updatedWorkouts };
}

export async function isTwoSplitProgramActive(): Promise<boolean> {
  const p = await db.programs.get(PROGRAM_ID);
  return !!p && !p.deletedAt && (p.status === 'active' || p.status === 'paused');
}

/**
 * 套用二分化循環課表。舊的目前計畫由 saveProgram 的唯一性守衛標成 abandoned（進封存，之後可以「重新啟用」），
 * 所有訓練紀錄、範本、舊計畫的進度一律不刪。
 */
export async function applyTwoSplitProgram(now: number = Date.now()): Promise<{ markedSlots: string[] }> {
  const exercises = await listExercises();
  const nameToId = new Map(exercises.map((x) => [x.name, x.id]));
  for (const day of TWO_SPLIT_DAYS) {
    for (const spec of day.entries) {
      for (const name of [spec.name, spec.alt]) {
        if (!name || nameToId.has(name)) continue;
        const source = name === spec.name ? spec : { muscleGroup: spec.muscleGroup, equipment: spec.equipment };
        nameToId.set(name, await addExercise({ name, muscleGroup: source.muscleGroup, equipment: source.equipment }));
      }
    }
  }

  for (const template of buildTwoSplitTemplates(nameToId, now)) await saveTemplate(template);

  const exerciseMap = new Map((await listExercises()).map((x) => [x.id, x]));
  const startOfToday = new Date(now);
  startOfToday.setHours(0, 0, 0, 0);
  const base = buildTwoSplitProgram(now);
  const { program, updatedWorkouts } = backfillTodayWorkouts(
    base,
    await listCompletedWorkouts(),
    exerciseMap,
    startOfToday.getTime(),
  );

  await saveProgram(program);
  for (const w of updatedWorkouts) await db.workouts.put({ ...w, updatedAt: now });
  return { markedSlots: program.completedSlotIdsThisLap };
}
