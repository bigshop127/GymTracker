import { db, type WorkoutTemplate, type Workout } from './schema';

export function createTemplateFromWorkout(workout: Workout, name: string): WorkoutTemplate {
  const now = Date.now();
  return {
    id: crypto.randomUUID(),
    name,
    location: workout.location,
    createdAt: now,
    updatedAt: now,
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
        createdAt: now,
        // 保留有氧欄位
        ...(setLog.durationSeconds !== undefined && { durationSeconds: setLog.durationSeconds }),
        ...(setLog.distanceKm !== undefined && { distanceKm: setLog.distanceKm }),
        ...(setLog.calories !== undefined && { calories: setLog.calories }),
      })),
    })),
  };
}

export async function listTemplates(): Promise<WorkoutTemplate[]> {
  return db.templates.reverse().sortBy('createdAt');
}

export async function getTemplate(id: string): Promise<WorkoutTemplate | undefined> {
  return db.templates.get(id);
}

export async function saveTemplate(template: WorkoutTemplate): Promise<void> {
  await db.templates.put({ ...template, updatedAt: Date.now() });
}

export async function deleteTemplate(id: string): Promise<void> {
  await db.templates.delete(id);
}
