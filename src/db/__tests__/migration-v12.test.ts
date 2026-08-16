import 'fake-indexeddb/auto';
import Dexie from 'dexie';
import { describe, test, expect, beforeAll } from 'vitest';

const LEGACY_STORES = {
  exercises: 'id, name, muscleGroup, equipment, isCustom, createdAt, updatedAt',
  workouts: 'id, startedAt, endedAt, status, updatedAt',
  bodyMetrics: 'id, date, updatedAt',
  settings: 'id',
  templates: 'id, name, createdAt, updatedAt',
  programs: 'id, name, status, createdAt, updatedAt',
  idAliases: 'id, updatedAt',
  dayOverrides: 'id, updatedAt',
};

const OLD_TIME = 1_000_000;

async function seedLegacyDatabase() {
  const legacy = new Dexie('GymTrackerDatabase');
  legacy.version(11).stores(LEGACY_STORES);
  await legacy.open();

  await legacy.table('programs').bulkPut([
    {
      id: 'prog-legacy-1',
      name: '舊版計畫1',
      slots: [
        { id: 's1', label: '拉 (Pull)' },
        { id: 's2', label: '推 (Push)' },
        { id: 's3', label: '腿 (Leg)' },
      ],
      cursor: 1, // 拉已完成，下一個該練推
      cycleCount: 2,
      status: 'active',
      createdAt: OLD_TIME,
      updatedAt: OLD_TIME,
    },
    {
      id: 'prog-legacy-2',
      name: '舊版計畫2',
      slots: [
        { id: 's1', label: '拉 (Pull)' },
        { id: 's2', label: '推 (Push)' },
      ],
      cursor: 0, // 全未練
      cycleCount: 0,
      status: 'active',
      createdAt: OLD_TIME,
      updatedAt: OLD_TIME,
    }
  ]);

  legacy.close();
}

describe('Dexie version(12)：TrainingProgram.cursor -> completedSlotIdsThisLap', () => {
  let db: typeof import('../schema').db;

  beforeAll(async () => {
    await seedLegacyDatabase();
    ({ db } = await import('../schema'));
    await db.open();
  });

  test('正確遷移 active program 且轉換 cursor 為 completedSlotIdsThisLap', async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const p1 = await db.programs.get('prog-legacy-1') as any;
    expect(p1).toBeDefined();
    expect(p1.cursor).toBeUndefined();
    expect(p1.completedSlotIdsThisLap).toEqual(['s1']);
    expect(p1.cycleCount).toBe(2);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const p2 = await db.programs.get('prog-legacy-2') as any;
    expect(p2).toBeDefined();
    expect(p2.cursor).toBeUndefined();
    expect(p2.completedSlotIdsThisLap).toEqual([]);
    expect(p2.cycleCount).toBe(0);
  });
});
