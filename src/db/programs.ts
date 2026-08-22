import { db, type TrainingProgram } from './schema';
import { isCurrentProgram, restartProgram } from '../lib/programLifecycle';

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

export async function getCurrentProgram(): Promise<TrainingProgram | null> {
  const current = await db.programs
    .where('status')
    .anyOf(['active', 'paused'])
    .and(p => !p.deletedAt)
    .first();
  return current || null;
}

export async function getProgram(id: string): Promise<TrainingProgram | undefined> {
  const program = await db.programs.get(id);
  if (program && program.deletedAt) return undefined;
  return program;
}

export async function saveProgram(program: TrainingProgram): Promise<void> {
  const now = Date.now();
  const updatedProgram = { ...program, updatedAt: now };

  if (isCurrentProgram(updatedProgram)) {
    await db.transaction('rw', db.programs, async () => {
      const currentPrograms = (await db.programs
        .where('status')
        .anyOf(['active', 'paused'])
        .toArray()).filter(p => !p.deletedAt);

      for (const current of currentPrograms) {
        if (current.id !== updatedProgram.id) {
          await db.programs.put({
            ...current,
            status: 'abandoned',
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

/** 重新開始：封存目前計畫、建立同結構的全新副本，兩筆寫入包在同一個 transaction */
export async function restartCurrentProgram(now: number): Promise<{ archived: TrainingProgram; fresh: TrainingProgram }> {
  return db.transaction('rw', db.programs, async () => {
    const current = (await db.programs
      .where('status')
      .anyOf(['active', 'paused'])
      .toArray()).filter(p => !p.deletedAt)[0];
    if (!current) throw new Error('NO_CURRENT_PROGRAM');

    const { archived, fresh } = restartProgram(current, now);
    await db.programs.bulkPut([archived, fresh]);
    return { archived, fresh };
  });
}

export async function deleteProgram(id: string): Promise<void> {
  const program = await db.programs.get(id);
  if (!program) return;
  const now = Date.now();
  await db.programs.put({ ...program, deletedAt: now, updatedAt: now });
}
