import { type Workout } from '../db/schema';
import { normalizeSplit } from './splitRotation';

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
  const usable = workouts
    .filter((w) => w.status === 'completed' && !w.deletedAt)
    .sort((a, b) => b.startedAt - a.startedAt);

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
