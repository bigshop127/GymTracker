import type { Workout, Exercise, MuscleGroup } from '../db/schema';

/** 由動作清單建立 id → Exercise 查表 */
export function buildExerciseMap(exercises: Exercise[]): Map<string, Exercise> {
  const map = new Map<string, Exercise>();
  for (const ex of exercises) {
    map.set(ex.id, ex);
  }
  return map;
}

/**
 * 計算這次訓練各部位的「組數」累計。
 * 規則：逐 entry 取其 exercise.muscleGroup，累加 entry.sets.length（含暖身）。
 * 動作已被刪除（map 查不到）→ 略過不計。
 * 回傳 Map<MuscleGroup, number>。
 */
export function getMuscleGroupCounts(workout: Workout, exMap: Map<string, Exercise>): Map<MuscleGroup, number> {
  const counts = new Map<MuscleGroup, number>();
  for (const entry of workout.entries) {
    const ex = exMap.get(entry.exerciseId);
    if (!ex) continue;
    const mg = ex.muscleGroup;
    counts.set(mg, (counts.get(mg) || 0) + entry.sets.length);
  }
  return counts;
}

/**
 * 取主要部位，依組數由多到少；同數時用「首次出現順序」當 tie-break（穩定、可預期）。
 * topN 預設不限，呼叫端自行 slice。
 */
export function getPrimaryMuscleGroups(workout: Workout, exMap: Map<string, Exercise>, topN?: number): MuscleGroup[] {
  const counts = getMuscleGroupCounts(workout, exMap);
  const sorted = Array.from(counts.entries()).sort((a, b) => {
    if (b[1] !== a[1]) {
      return b[1] - a[1];
    }
    // JS sort is stable in ES2019+, and Map.entries() retains insertion order.
    // So if counts are equal, keeping the original relative order is correct.
    return 0;
  });

  const result = sorted.map(([mg]) => mg);
  return topN !== undefined ? result.slice(0, topN) : result;
}

/**
 * 自動標題：`M/D 部位1+部位2`（取組數最多的前 2 個部位）。
 * 無可辨識部位（空訓練或動作都被刪）→ 回傳 `M/D 訓練`。
 * 日期一律用 workout.startedAt 的「本地時間」M/D（無補零，例：6/28）。
 */
export function buildAutoWorkoutTitle(workout: Workout, exMap: Map<string, Exercise>): string {
  const date = new Date(workout.startedAt);
  const month = date.getMonth() + 1;
  const day = date.getDate();
  const dateStr = `${month}/${day}`;

  const primaryMuscles = getPrimaryMuscleGroups(workout, exMap, 2);
  if (primaryMuscles.length === 0) {
    return `${dateStr} 訓練`;
  }
  return `${dateStr} ${primaryMuscles.join('+')}`;
}

/**
 * 這天的代表：主場 = 總組數最多的那筆（同分取較晚 startedAt）。
 * 回傳其 location 與主要部位（top1）。
 */
export function getDaySummary(dayWorkouts: Workout[], exMap: Map<string, Exercise>): {
  location?: string;
  primaryMuscle?: MuscleGroup;
} {
  if (dayWorkouts.length === 0) {
    return {};
  }

  const sorted = [...dayWorkouts].sort((a, b) => {
    const aSets = a.entries.reduce((sum, e) => sum + e.sets.length, 0);
    const bSets = b.entries.reduce((sum, e) => sum + e.sets.length, 0);
    if (bSets !== aSets) {
      return bSets - aSets;
    }
    return b.startedAt - a.startedAt;
  });

  const representative = sorted[0];
  const primaryMuscle = getPrimaryMuscleGroups(representative, exMap, 1)[0];

  return {
    location: representative.location,
    primaryMuscle,
  };
}
