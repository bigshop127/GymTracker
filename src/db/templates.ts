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
      ...(entry.candidateExerciseIds && entry.candidateExerciseIds.length > 1
        ? { candidateExerciseIds: [...entry.candidateExerciseIds] }
        : {}),
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
  const templates = await db.templates.reverse().sortBy('createdAt');
  return templates.filter(t => !t.deletedAt);
}

export async function getTemplate(id: string): Promise<WorkoutTemplate | undefined> {
  const template = await db.templates.get(id);
  if (template && template.deletedAt) return undefined;
  return template;
}

export async function saveTemplate(template: WorkoutTemplate): Promise<void> {
  await db.templates.put({ ...template, updatedAt: Date.now() });
}

export async function deleteTemplate(id: string): Promise<void> {
  const template = await db.templates.get(id);
  if (!template) return;
  const now = Date.now();
  await db.templates.put({ ...template, deletedAt: now, updatedAt: now });
}
