import { db, type WorkoutEntry, type SetLog } from '../db/schema';
import { listExercises, addExercise } from '../db/exercises';
import { saveTemplate } from '../db/templates';
import { useProgramStore } from '../store/program';
import { ZONGYUAN_8WEEK_PLAN, ZONGYUAN_PROGRAM_NAME } from '../data/zongyuan-8week-program';

export async function isZongYuanProgramImported(): Promise<boolean> {
  const programs = await db.programs.toArray();
  return programs.some((p) => p.name === ZONGYUAN_PROGRAM_NAME);
}

/**
 * 匯入宗諺 8 週 4 天分化課表：
 * 1. 補齊動作庫缺少的自訂動作（依名稱比對，避免重複建立）
 * 2. 建立 4 個訓練範本（拉/推/腿/手），組數/次數採用 W1 數字當預設
 * 3. 建立 1 個訓練計畫，循環依序：拉→推→腿→手
 */
export async function importZongYuanProgram(): Promise<void> {
  const existingExercises = await listExercises();
  const nameToId = new Map(existingExercises.map((e) => [e.name, e.id]));

  for (const day of ZONGYUAN_8WEEK_PLAN) {
    for (const ex of day.exercises) {
      if (!nameToId.has(ex.exerciseName)) {
        const id = await addExercise({
          name: ex.exerciseName,
          muscleGroup: ex.muscleGroup,
          equipment: ex.equipment,
        });
        nameToId.set(ex.exerciseName, id);
      }
    }
  }

  const now = Date.now();
  const slots: { label: string; templateId: string }[] = [];

  for (const day of ZONGYUAN_8WEEK_PLAN) {
    const templateId = crypto.randomUUID();
    const entries: WorkoutEntry[] = day.exercises.map((ex, order) => {
      const exerciseId = nameToId.get(ex.exerciseName)!;
      const sets: SetLog[] = Array.from({ length: ex.week1Sets }, () => ({
        id: crypto.randomUUID(),
        weight: 0,
        reps: ex.week1Reps,
        isWarmup: false,
        completed: false,
        createdAt: now,
      }));
      return {
        id: crypto.randomUUID(),
        exerciseId,
        order,
        sets,
      };
    });

    await saveTemplate({
      id: templateId,
      name: day.label,
      entries,
      createdAt: now,
      updatedAt: now,
    });
    slots.push({ label: day.label, templateId });
  }

  await useProgramStore.getState().createProgram(ZONGYUAN_PROGRAM_NAME, slots, { min: 8, max: 8 });
}
