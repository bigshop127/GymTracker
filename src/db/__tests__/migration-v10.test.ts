import 'fake-indexeddb/auto';
import Dexie from 'dexie';
import { describe, test, expect, beforeAll } from 'vitest';
import { type Workout, type WorkoutTemplate, type Exercise } from '../schema';
import { seedExerciseId } from '../../data/seed-exercises';

const LEGACY_STORES = {
  exercises: 'id, name, muscleGroup, equipment, isCustom, createdAt, updatedAt',
  workouts: 'id, startedAt, endedAt, status, updatedAt',
  bodyMetrics: 'id, date, updatedAt',
  settings: 'id',
  templates: 'id, name, createdAt, updatedAt',
  programs: 'id, name, status, createdAt, updatedAt',
  idAliases: 'id, updatedAt',
};

const OLD_TIME = 1_000_000;

async function seedLegacyDatabase() {
  const legacy = new Dexie('GymTrackerDatabase');
  legacy.version(9).stores(LEGACY_STORES);
  await legacy.open();

  // (1) Exercises
  await legacy.table('exercises').bulkPut([
    // Renamed exercises
    { id: seedExerciseId('滑輪下拉'), name: '滑輪下拉', muscleGroup: '背', equipment: '纜繩', isCustom: false, createdAt: OLD_TIME, updatedAt: OLD_TIME },
    { id: seedExerciseId('坐姿划船'), name: '坐姿划船', muscleGroup: '背', equipment: '纜繩', isCustom: false, createdAt: OLD_TIME, updatedAt: OLD_TIME },
    { id: seedExerciseId('纜繩下壓'), name: '纜繩下壓', muscleGroup: '手臂', equipment: '纜繩', isCustom: false, createdAt: OLD_TIME, updatedAt: OLD_TIME },
    
    // To change muscleGroup
    { id: seedExerciseId('啞鈴飛鳥'), name: '啞鈴飛鳥', muscleGroup: '胸', equipment: '啞鈴', isCustom: false, createdAt: OLD_TIME, updatedAt: OLD_TIME },
    
    // Hand exercises to backfill subGroup
    { id: seedExerciseId('槓鈴彎舉'), name: '槓鈴彎舉', muscleGroup: '手臂', equipment: '槓鈴', isCustom: false, createdAt: OLD_TIME, updatedAt: OLD_TIME },
    { id: seedExerciseId('窄握臥推'), name: '窄握臥推', muscleGroup: '手臂', equipment: '槓鈴', isCustom: false, createdAt: OLD_TIME, updatedAt: OLD_TIME },
    
    // Custom exercise "斜板推" to be soft deleted
    { id: 'custom-xie-ban-tui', name: '斜板推', muscleGroup: '胸', equipment: '機械', isCustom: true, createdAt: OLD_TIME, updatedAt: OLD_TIME }
  ]);

  // (2) Workouts
  await legacy.table('workouts').bulkPut([
    // Active workout containing "滑輪下拉" and "斜板推"
    {
      id: 'w-active',
      startedAt: OLD_TIME,
      status: 'active',
      updatedAt: OLD_TIME,
      entries: [
        { id: 'e1', exerciseId: seedExerciseId('滑輪下拉'), order: 0, sets: [{ id: 's1', weight: 40, reps: 10, isWarmup: false, completed: false, createdAt: OLD_TIME }] },
        { id: 'e2', exerciseId: 'custom-xie-ban-tui', order: 1, sets: [{ id: 's2', weight: 50, reps: 10, isWarmup: false, completed: false, createdAt: OLD_TIME }] }
      ]
    },
    // Completed workout containing "斜板推" (should NOT be modified)
    {
      id: 'w-completed',
      startedAt: OLD_TIME,
      status: 'completed',
      updatedAt: OLD_TIME,
      entries: [
        { id: 'e3', exerciseId: 'custom-xie-ban-tui', order: 0, sets: [{ id: 's3', weight: 50, reps: 10, isWarmup: false, completed: true, createdAt: OLD_TIME }] }
      ]
    }
  ]);

  // (3) Templates
  await legacy.table('templates').bulkPut([
    {
      id: 't-test',
      name: '測試範本',
      createdAt: OLD_TIME,
      updatedAt: OLD_TIME,
      entries: [
        { id: 'te1', exerciseId: seedExerciseId('坐姿划船'), order: 0, sets: [] },
        { id: 'te2', exerciseId: 'custom-xie-ban-tui', order: 1, sets: [] }
      ]
    }
  ]);

  // (4) Existing idAliases (V9)
  await legacy.table('idAliases').bulkPut([
    { id: 'old-random-bench', newId: 'seed:槓鈴臥推', updatedAt: OLD_TIME }
  ]);

  legacy.close();
}

describe('Dexie version(10)：動作庫整理 + 輔助重量 + 手臂細分', () => {
  let db: typeof import('../schema').db;

  beforeAll(async () => {
    await seedLegacyDatabase();
    ({ db } = await import('../schema'));
    await db.open();
  });

  test('內建動作改名且換 id，並建立舊 id 對照', async () => {
    expect(await db.exercises.get(seedExerciseId('滑輪下拉'))).toBeUndefined();
    expect(await db.exercises.get(seedExerciseId('滑輪下拉（寬握）'))).toBeDefined();
    
    expect(await db.exercises.get(seedExerciseId('坐姿划船'))).toBeUndefined();
    expect(await db.exercises.get(seedExerciseId('坐姿划船（寬握）'))).toBeDefined();

    expect(await db.exercises.get(seedExerciseId('纜繩下壓'))).toBeUndefined();
    expect(await db.exercises.get(seedExerciseId('纜繩下壓（平把）'))).toBeDefined();

    // v9 的對照仍在，且多了三筆
    expect(await db.idAliases.count()).toBe(4);
    expect(await db.idAliases.get('old-random-bench')).toBeDefined();
    expect(await db.idAliases.get(seedExerciseId('滑輪下拉'))).toEqual({
      id: seedExerciseId('滑輪下拉'),
      newId: seedExerciseId('滑輪下拉（寬握）'),
      updatedAt: expect.any(Number),
    });
  });

  test('舊 workout / template 中的動作參照被改寫', async () => {
    const wActive = await db.workouts.get('w-active') as Workout;
    expect(wActive.entries.length).toBe(1);
    expect(wActive.entries[0].exerciseId).toBe(seedExerciseId('滑輪下拉（寬握）'));
    expect(wActive.entries[0].order).toBe(0);
    expect(wActive.updatedAt).toBeGreaterThan(OLD_TIME);
  });

  test('已完成的 workout 沒被動到', async () => {
    const wCompleted = await db.workouts.get('w-completed') as Workout;
    expect(wCompleted.entries.length).toBe(1);
    expect(wCompleted.entries[0].exerciseId).toBe('custom-xie-ban-tui');
    expect(wCompleted.updatedAt).toBe(OLD_TIME);
  });

  test('範本裡的動作參照也被改寫且移除斜板推', async () => {
    const tTest = await db.templates.get('t-test') as WorkoutTemplate;
    expect(tTest.entries.length).toBe(1);
    expect(tTest.entries[0].exerciseId).toBe(seedExerciseId('坐姿划船（寬握）'));
    expect(tTest.entries[0].order).toBe(0);
    expect(tTest.updatedAt).toBeGreaterThan(OLD_TIME);
  });

  test('啞鈴飛鳥的 muscleGroup === 肩', async () => {
    const feiNiao = await db.exercises.get(seedExerciseId('啞鈴飛鳥')) as Exercise;
    expect(feiNiao).toBeDefined();
    expect(feiNiao.muscleGroup).toBe('肩');
  });

  test('手臂動作的 subGroup 有回填', async () => {
    const bicep = await db.exercises.get(seedExerciseId('槓鈴彎舉')) as Exercise;
    expect(bicep).toBeDefined();
    expect(bicep.subGroup).toBe('二頭');

    const tricep = await db.exercises.get(seedExerciseId('窄握臥推')) as Exercise;
    expect(tricep).toBeDefined();
    expect(tricep.subGroup).toBe('三頭');
  });
});
