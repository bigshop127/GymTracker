import { db, type Exercise } from './schema';
import { SEED_EXERCISES } from '../data/seed-exercises';

/**
 * 取得所有動作列表
 */
export async function listExercises(): Promise<Exercise[]> {
  return db.exercises.toArray();
}

/**
 * 新增自訂動作
 */
export async function addExercise(exercise: Omit<Exercise, 'id' | 'createdAt' | 'isCustom'>): Promise<string> {
  const id = crypto.randomUUID();
  const newExercise: Exercise = {
    ...exercise,
    id,
    isCustom: true,
    createdAt: Date.now(),
  };
  await db.exercises.add(newExercise);
  return id;
}

/**
 * 更新動作
 */
export async function updateExercise(id: string, updates: Partial<Omit<Exercise, 'id' | 'isCustom'>>): Promise<void> {
  await db.exercises.update(id, updates);
}

/**
 * 刪除動作
 */
export async function deleteExercise(id: string): Promise<void> {
  await db.exercises.delete(id);
}

/**
 * 首次啟動初始化：若動作庫為空，則寫入內建動作 (seed)
 */
export async function seedExercisesIfEmpty(): Promise<void> {
  const count = await db.exercises.count();
  if (count === 0) {
    const exercisesToInsert: Exercise[] = SEED_EXERCISES.map((seed, index) => ({
      id: crypto.randomUUID(),
      name: seed.name,
      muscleGroup: seed.muscleGroup,
      equipment: seed.equipment,
      isCustom: false,
      createdAt: Date.now() + index, // 微小差異以保持順序或合理時間戳
    }));
    await db.exercises.bulkAdd(exercisesToInsert);
    console.log(`Seeded ${exercisesToInsert.length} default exercises.`);
  }
}
