import { type Workout, type SetLog } from '../db/schema';

export interface ExerciseSession {
  workoutId: string;
  date: number; // workout.startedAt
  location?: string;
  sets: SetLog[]; // 該次訓練這個動作的所有「已完成」組（含暖身，UI 自行分辨）
}

/** 取得單一動作在所有完成訓練中的紀錄，依日期新到舊排序 */
export function getExerciseSessions(workouts: Workout[], exerciseId: string): ExerciseSession[] {
  const sessions: ExerciseSession[] = [];
  for (const workout of workouts) {
    if (workout.status !== 'completed') continue;
    const entries = workout.entries.filter((e) => e.exerciseId === exerciseId);
    if (entries.length === 0) continue;
    const sets = entries.flatMap((e) => e.sets).filter((s) => s.completed);
    if (sets.length === 0) continue;
    sessions.push({ workoutId: workout.id, date: workout.startedAt, location: workout.location, sets });
  }
  return sessions.sort((a, b) => b.date - a.date);
}

export interface TrackedExerciseSummary {
  exerciseId: string;
  lastDate: number;
  sessionCount: number;
}

/** 掃描所有完成訓練，彙整「有練過的動作」清單，依最後練習日期新到舊排序 */
export function getTrackedExerciseSummaries(workouts: Workout[]): TrackedExerciseSummary[] {
  const map = new Map<string, TrackedExerciseSummary>();
  for (const workout of workouts) {
    if (workout.status !== 'completed') continue;
    for (const entry of workout.entries) {
      const hasCompletedSet = entry.sets.some((s) => s.completed);
      if (!hasCompletedSet) continue;
      const existing = map.get(entry.exerciseId);
      if (!existing) {
        map.set(entry.exerciseId, { exerciseId: entry.exerciseId, lastDate: workout.startedAt, sessionCount: 1 });
      } else {
        existing.sessionCount += 1;
        if (workout.startedAt > existing.lastDate) existing.lastDate = workout.startedAt;
      }
    }
  }
  return Array.from(map.values()).sort((a, b) => b.lastDate - a.lastDate);
}
