import { db, type Exercise } from './schema';
import { SEED_EXERCISES, seedExerciseId } from '../data/seed-exercises';

export async function listExercises(): Promise<Exercise[]> {
  const exercises = await db.exercises.toArray();
  return exercises.filter(e => !e.deletedAt);
}

export async function addExercise(exercise: Omit<Exercise, 'id' | 'createdAt' | 'isCustom' | 'updatedAt' | 'deletedAt'>): Promise<string> {
  const id = crypto.randomUUID();
  const now = Date.now();
  const newExercise: Exercise = {
    ...exercise,
    id,
    isCustom: true,
    createdAt: now,
    updatedAt: now,
  };
  await db.exercises.add(newExercise);
  return id;
}

export async function updateExercise(id: string, updates: Partial<Omit<Exercise, 'id' | 'isCustom'>>): Promise<void> {
  const exercise = await db.exercises.get(id);
  if (!exercise) throw new Error('Exercise not found');
  if (!exercise.isCustom) throw new Error('Cannot update built-in exercise');
  
  const merged = { ...exercise, ...updates, updatedAt: Date.now() };
  if (updates.subGroup === undefined) {
    delete merged.subGroup;
  }
  await db.exercises.put(merged);
}

export async function deleteExercise(id: string): Promise<void> {
  const exercise = await db.exercises.get(id);
  if (!exercise) return;
  if (!exercise.isCustom) throw new Error('Cannot delete built-in exercise');
  const now = Date.now();
  await db.exercises.put({ ...exercise, deletedAt: now, updatedAt: now });
}

export async function seedExercisesIfEmpty(): Promise<void> {
  const allExercises = await db.exercises.toArray();
  const existing = allExercises.filter(e => !e.deletedAt);
  if (existing.length === 0) {
    const now = Date.now();
    const exercisesToInsert: Exercise[] = SEED_EXERCISES.map((seed, index) => ({
      id: seedExerciseId(seed.name),
      name: seed.name,
      muscleGroup: seed.muscleGroup,
      equipment: seed.equipment,
      subGroup: seed.subGroup,
      isCustom: false,
      createdAt: now + index,
      updatedAt: now + index,
    }));
    await db.exercises.bulkPut(exercisesToInsert);
    console.log(`Seeded ${exercisesToInsert.length} default exercises.`);
    return;
  }

  // 補齊後續版本新增的 seed 動作（按名稱比對）
  const existingNames = new Set(existing.map((e) => e.name));
  const missing = SEED_EXERCISES.filter((s) => !existingNames.has(s.name));
  if (missing.length > 0) {
    const now = Date.now();
    const toInsert: Exercise[] = missing.map((seed, index) => ({
      id: seedExerciseId(seed.name),
      name: seed.name,
      muscleGroup: seed.muscleGroup,
      equipment: seed.equipment,
      subGroup: seed.subGroup,
      isCustom: false,
      createdAt: now + index,
      updatedAt: now + index,
    }));
    await db.exercises.bulkPut(toInsert);
    console.log(`Added ${toInsert.length} missing seed exercises.`);
  }
}
