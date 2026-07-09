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
  const now = Date.now();
  const updatedProgram = { ...program, updatedAt: now };

  if (updatedProgram.status === 'active') {
    await db.transaction('rw', db.programs, async () => {
      const activePrograms = await db.programs
        .where('status')
        .equals('active')
        .toArray();

      for (const active of activePrograms) {
        if (active.id !== updatedProgram.id) {
          await db.programs.put({
            ...active,
            status: 'completed',
            completedAt: now,
            updatedAt: now,
          });
        }
      }
      await db.programs.put(updatedProgram);
    });
  } else {
    await db.programs.put(updatedProgram);
  }
}

export async function deleteProgram(id: string): Promise<void> {
  await db.programs.delete(id);
}
