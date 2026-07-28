import { db, type TrainingProgram } from './schema';

export async function listPrograms(): Promise<TrainingProgram[]> {
  const programs = await db.programs.reverse().sortBy('createdAt');
  return programs.filter(p => !p.deletedAt);
}

export async function getActiveProgram(): Promise<TrainingProgram | null> {
  const activeProgram = await db.programs
    .where('status')
    .equals('active')
    .and(p => !p.deletedAt)
    .first();
  return activeProgram || null;
}

export async function getProgram(id: string): Promise<TrainingProgram | undefined> {
  const program = await db.programs.get(id);
  if (program && program.deletedAt) return undefined;
  return program;
}

export async function saveProgram(program: TrainingProgram): Promise<void> {
  const now = Date.now();
  const updatedProgram = { ...program, updatedAt: now };

  if (updatedProgram.status === 'active') {
    await db.transaction('rw', db.programs, async () => {
      const activePrograms = (await db.programs
        .where('status')
        .equals('active')
        .toArray()).filter(p => !p.deletedAt);

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
  const program = await db.programs.get(id);
  if (!program) return;
  const now = Date.now();
  await db.programs.put({ ...program, deletedAt: now, updatedAt: now });
}
