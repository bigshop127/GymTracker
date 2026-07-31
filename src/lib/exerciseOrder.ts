import { SEED_EXERCISES } from '../data/seed-exercises';
import type { Exercise, MuscleGroup } from '../db/schema';

const MUSCLE_ORDER: MuscleGroup[] = ['胸', '背', '腿臀', '肩', '手臂', '核心', '有氧'];
const SEED_ORDER = new Map(SEED_EXERCISES.map((s, i) => [s.name, i]));

/**
 * 動作庫顯示排序：先肌群、再 seed 定義順序；自訂動作排在同肌群的內建動作之後（依建立時間）。
 * 純函式，不碰 Dexie。
 */
export function sortExercisesForDisplay(list: Exercise[]): Exercise[] {
  return [...list].sort((a, b) => {
    // 1. MUSCLE_ORDER 的索引
    const idxA = MUSCLE_ORDER.indexOf(a.muscleGroup);
    const idxB = MUSCLE_ORDER.indexOf(b.muscleGroup);
    if (idxA !== idxB) {
      return idxA - idxB;
    }

    // 2. 兩者都是內建 -> SEED_ORDER 索引
    const seedIdxA = SEED_ORDER.get(a.name);
    const seedIdxB = SEED_ORDER.get(b.name);

    if (seedIdxA !== undefined && seedIdxB !== undefined) {
      return seedIdxA - seedIdxB;
    }

    // 3. 一內建一自訂 -> 內建在前
    if (seedIdxA !== undefined && seedIdxB === undefined) {
      return -1;
    }
    if (seedIdxA === undefined && seedIdxB !== undefined) {
      return 1;
    }

    // 4. 都是自訂 -> createdAt 小的在前
    return a.createdAt - b.createdAt;
  });
}
