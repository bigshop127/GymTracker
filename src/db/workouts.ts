import { db, type Workout } from './schema';

/**
 * 取得當前進行中 (status === 'active') 的訓練草稿
 */
export async function getActiveWorkout(): Promise<Workout | null> {
  const activeWorkout = await db.workouts
    .where('status')
    .equals('active')
    .first();
  return activeWorkout || null;
}

/**
 * 新增或更新進行中的訓練草稿
 */
export async function saveActiveWorkout(workout: Workout): Promise<void> {
  await db.workouts.put(workout);
}

/**
 * 將指定訓練設定為已完成 (status === 'completed')
 */
export async function completeWorkout(workoutId: string): Promise<void> {
  const workout = await db.workouts.get(workoutId);
  if (workout) {
    workout.status = 'completed';
    workout.endedAt = Date.now();
    await db.workouts.put(workout);
  }
}

/**
 * 取得已完成的訓練歷史列表，依開始時間降冪排序
 */
export async function listCompletedWorkouts(): Promise<Workout[]> {
  return db.workouts
    .where('status')
    .equals('completed')
    .reverse()
    .sortBy('startedAt');
}

/**
 * 刪除指定的訓練紀錄
 */
export async function deleteWorkout(workoutId: string): Promise<void> {
  await db.workouts.delete(workoutId);
}
