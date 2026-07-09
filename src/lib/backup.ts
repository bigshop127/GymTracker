import { db, type Workout, type Exercise, type BodyMetric, type Settings, type WorkoutTemplate, type TrainingProgram } from '../db/schema';

export interface BackupData {
  version: number;
  workouts: Workout[];
  exercises: Exercise[];
  bodyMetrics: BodyMetric[];
  settings: Settings[];
  templates?: WorkoutTemplate[];
  programs?: TrainingProgram[];
  exportedAt: number;
}

/**
 * Exports all database tables as a JSON string.
 */
export async function exportBackupData(): Promise<string> {
  const workouts = await db.workouts.toArray();
  const exercises = await db.exercises.toArray();
  const bodyMetrics = await db.bodyMetrics.toArray();
  const settings = await db.settings.toArray();
  const templates = await db.templates.toArray();
  const programs = await db.programs.toArray();

  const data: BackupData = {
    version: 1,
    workouts,
    exercises,
    bodyMetrics,
    settings,
    templates,
    programs,
    exportedAt: Date.now(),
  };

  return JSON.stringify(data, null, 2);
}

/**
 * Imports all database tables from a JSON string.
 * This will overwrite current database records.
 */
export async function importBackupData(jsonString: string): Promise<void> {
  const data = JSON.parse(jsonString);

  if (!data || data.version !== 1) {
    throw new Error('不支援的備份格式版本');
  }

  await db.transaction('rw', [db.workouts, db.exercises, db.bodyMetrics, db.settings, db.templates, db.programs], async () => {
    if (Array.isArray(data.workouts)) {
      await db.workouts.clear();
      await db.workouts.bulkPut(data.workouts);
    }
    if (Array.isArray(data.exercises)) {
      await db.exercises.clear();
      await db.exercises.bulkPut(data.exercises);
    }
    if (Array.isArray(data.bodyMetrics)) {
      await db.bodyMetrics.clear();
      await db.bodyMetrics.bulkPut(data.bodyMetrics);
    }
    if (Array.isArray(data.settings)) {
      await db.settings.clear();
      await db.settings.bulkPut(data.settings);
    }
    if (Array.isArray(data.templates)) {
      await db.templates.clear();
      await db.templates.bulkPut(data.templates);
    }
    if (Array.isArray(data.programs)) {
      await db.programs.clear();
      await db.programs.bulkPut(data.programs);
    }
  });
}

