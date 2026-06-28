import { db, type WorkoutTemplate, type Workout } from './schema';

/**
 * 從現有訓練紀錄建立一個新的訓練範本
 */
export function createTemplateFromWorkout(workout: Workout, name: string): WorkoutTemplate {
  return {
    id: crypto.randomUUID(),
    name,
    location: workout.location,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    entries: workout.entries.map((entry) => ({
      id: crypto.randomUUID(),
      exerciseId: entry.exerciseId,
      order: entry.order,
      defaultRestSeconds: entry.defaultRestSeconds,
      sets: entry.sets.map((setLog) => ({
        id: crypto.randomUUID(),
        weight: setLog.weight,
        reps: setLog.reps,
        isWarmup: setLog.isWarmup,
        completed: false,
        createdAt: Date.now(),
      })),
    })),
  };
}

/**
 * 取得所有訓練範本，依建立時間降冪排序
 */
export async function listTemplates(): Promise<WorkoutTemplate[]> {
  return db.templates.reverse().sortBy('createdAt');
}

/**
 * 取得單一訓練範本
 */
export async function getTemplate(id: string): Promise<WorkoutTemplate | undefined> {
  return db.templates.get(id);
}

/**
 * 儲存或更新訓練範本
 */
export async function saveTemplate(template: WorkoutTemplate): Promise<void> {
  await db.templates.put(template);
}

/**
 * 刪除指定的訓練範本
 */
export async function deleteTemplate(id: string): Promise<void> {
  await db.templates.delete(id);
}
