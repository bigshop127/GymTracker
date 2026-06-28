// 訓練容量計算
// 依據 docs/ROADMAP.md §2 衍生運算定義：
// - 單組容量：weight × reps (僅計 isWarmup === false 且 completed === true 的組)
// - 單次訓練總容量：該次所有有效組的容量加總

interface MinimalSet {
  weight: number;
  reps: number;
  isWarmup: boolean;
  completed: boolean;
}

interface MinimalEntry {
  sets: MinimalSet[];
}

interface MinimalWorkout {
  entries: MinimalEntry[];
}

/**
 * 計算單組容量
 */
export function calculateSetVolume(set: MinimalSet): number {
  if (set.isWarmup || !set.completed) return 0;
  return set.weight * set.reps;
}

/**
 * 計算單一動作 (WorkoutEntry) 的總容量
 */
export function calculateEntryVolume(entry: MinimalEntry): number {
  return entry.sets.reduce((sum, set) => sum + calculateSetVolume(set), 0);
}

/**
 * 計算整場訓練 (Workout) 的總容量
 */
export function calculateWorkoutVolume(workout: MinimalWorkout): number {
  return workout.entries.reduce((sum, entry) => sum + calculateEntryVolume(entry), 0);
}
