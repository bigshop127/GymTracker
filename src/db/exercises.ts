import { db, type Exercise } from './schema';
import { SEED_EXERCISES } from '../data/seed-exercises';

export async function listExercises(): Promise<Exercise[]> {
  return db.exercises.toArray();
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
  await db.exercises.update(id, { ...updates, updatedAt: Date.now() });
}

export async function deleteExercise(id: string): Promise<void> {
  const exercise = await db.exercises.get(id);
  if (!exercise) return;
  if (!exercise.isCustom) throw new Error('Cannot delete built-in exercise');
  await db.exercises.delete(id);
}

export async function seedExercisesIfEmpty(): Promise<void> {
  const count = await db.exercises.count();
  if (count === 0) {
    const now = Date.now();
    const exercisesToInsert: Exercise[] = SEED_EXERCISES.map((seed, index) => ({
      id: crypto.randomUUID(),
      name: seed.name,
      muscleGroup: seed.muscleGroup,
      equipment: seed.equipment,
      isCustom: false,
      createdAt: now + index,
      updatedAt: now + index,
    }));
    await db.exercises.bulkAdd(exercisesToInsert);
    console.log(`Seeded ${exercisesToInsert.length} default exercises.`);
  }
}
