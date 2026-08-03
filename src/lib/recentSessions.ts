import { type Workout, type Exercise, type MuscleGroup } from '../db/schema';
import { normalizeSplit } from './splitRotation';
import { getPrimaryMuscleGroups } from './workoutSummary';

/** 只留下可以拿來沿用的訓練：已完成、未軟刪除，並照 startedAt 由新到舊 */
function usableWorkouts(workouts: Workout[]): Workout[] {
  return workouts
    .filter((w) => w.status === 'completed' && !w.deletedAt)
    .sort((a, b) => b.startedAt - a.startedAt);
}

/**
 * 取這個 slot 最近幾次的完成訓練（新→舊）。
 *
 * 兩層來源，依序取用並去重（同一筆 workout.id 不重複）：
 *   1. 精準比對：programId + programSlotId 都對得上
 *   2. 補位：normalizeSplit(title) 與 slotLabel 同類（slotLabel 判不出分類時這層跳過）
 *
 * 過濾：只收 status === 'completed' 且未軟刪除；一律照 startedAt 由新到舊。
 */
export function getRecentWorkoutsForSlot(
  workouts: Workout[],
  programId: string,
  slotId: string,
  slotLabel: string,
  limit = 3,
): Workout[] {
  const usable = usableWorkouts(workouts);

  const exact = usable.filter((w) => w.programId === programId && w.programSlotId === slotId);
  const picked = exact.slice(0, limit);
  if (picked.length >= limit) return picked;

  const category = normalizeSplit(slotLabel);
  if (!category) return picked;

  const pickedIds = new Set(picked.map((w) => w.id));
  for (const workout of usable) {
    if (picked.length >= limit) break;
    if (pickedIds.has(workout.id)) continue;
    if (normalizeSplit(workout.title) !== category) continue;
    picked.push(workout);
    pickedIds.add(workout.id);
  }

  return picked;
}

/** 這次訓練有沒有練到某個部位（依實際做的動作判定，查不到的動作略過） */
function hasMuscleGroup(workout: Workout, group: MuscleGroup, exMap: Map<string, Exercise>): boolean {
  return workout.entries.some((entry) => exMap.get(entry.exerciseId)?.muscleGroup === group);
}

/**
 * 取某個部位最近幾次的完成訓練（新→舊），給「開始新訓練 → 選部位」用。
 *
 * 兩層來源，依序取用、去重：
 *   1. **主要部位**就是它（組數最多的那個部位）——最貼近「這是一場胸的訓練」
 *   2. 補位：有練到這個部位就算（例如背日順練的二頭）
 *
 * 一律只收已完成、未軟刪除的訓練；標題不參與判定，看的是實際做過的動作。
 */
export function getRecentWorkoutsForMuscleGroup(
  workouts: Workout[],
  group: MuscleGroup,
  exMap: Map<string, Exercise>,
  limit = 3,
): Workout[] {
  const usable = usableWorkouts(workouts);

  const primary = usable.filter((w) => getPrimaryMuscleGroups(w, exMap, 1)[0] === group);
  const picked = primary.slice(0, limit);
  if (picked.length >= limit) return picked;

  const pickedIds = new Set(picked.map((w) => w.id));
  for (const workout of usable) {
    if (picked.length >= limit) break;
    if (pickedIds.has(workout.id)) continue;
    if (!hasMuscleGroup(workout, group, exMap)) continue;
    picked.push(workout);
    pickedIds.add(workout.id);
  }

  return picked;
}

/** 每個部位最近一次練到是什麼時候（部位選單顯示「N天前」用）；沒練過就沒有鍵 */
export function getLastTrainedByMuscleGroup(
  workouts: Workout[],
  exMap: Map<string, Exercise>,
): Map<MuscleGroup, number> {
  const result = new Map<MuscleGroup, number>();
  for (const workout of usableWorkouts(workouts)) {
    for (const entry of workout.entries) {
      const group = exMap.get(entry.exerciseId)?.muscleGroup;
      if (!group) continue;
      // usableWorkouts 已由新到舊，第一次遇到就是最近一次
      if (!result.has(group)) {
        result.set(group, workout.startedAt);
      }
    }
  }
  return result;
}
