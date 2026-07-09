import { db, type TrainingProgram } from './schema';

export async function listPrograms(): Promise<TrainingProgram[]> {
  return db.programs.reverse().sortBy('createdAt');
}

export async function getActiveProgram(): Promise<TrainingProgram | null> {
  const activeProgram = await db.programs
    .where('status')
    .equals('active')
    .first();
  return activeProgram || null;
}

export async function getProgram(id: string): Promise<TrainingProgram | undefined> {
  return db.programs.get(id);
}

export async function saveProgram(program: TrainingProgram): Promise<void> {
  await db.programs.put({ ...program, updatedAt: Date.now() });
}

export async function deleteProgram(id: string): Promise<void> {
  await db.programs.delete(id);
}
