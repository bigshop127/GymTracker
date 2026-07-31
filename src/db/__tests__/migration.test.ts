import 'fake-indexeddb/auto';
import Dexie from 'dexie';
import { describe, test, expect, beforeAll } from 'vitest';
import { type Workout, type WorkoutTemplate, type Exercise, type IdAlias } from '../schema';

/**
 * version(9) 升級的真實測試：先用舊 schema(v8) 建庫塞資料，再讓 App 的 db 開起來跑升級。
 * 這段動到使用者全部訓練歷史，不能只靠讀 code 放行。
 */
const LEGACY_STORES = {
  exercises: 'id, name, muscleGroup, equipment, isCustom, createdAt, updatedAt',
  workouts: 'id, startedAt, endedAt, status, updatedAt',
  bodyMetrics: 'id, date, updatedAt',
  settings: 'id',
  templates: 'id, name, createdAt, updatedAt',
  programs: 'id, name, status, createdAt, updatedAt',
};

const OLD_TIME = 1_000_000;

async function seedLegacyDatabase() {
  const legacy = new Dexie('GymTrackerDatabase');
  legacy.version(8).stores(LEGACY_STORES);
  await legacy.open();

  await legacy.table('exercises').bulkPut([
    // 內建動作：本機自己生的隨機 id，升級後要換成 seed:名稱
    { id: 'rand-bench', name: '槓鈴臥推', muscleGroup: '胸', equipment: '槓鈴', isCustom: false, createdAt: OLD_TIME, updatedAt: OLD_TIME },
    { id: 'rand-row', name: '坐姿划船', muscleGroup: '背', equipment: '纜繩', isCustom: false, createdAt: OLD_TIME, updatedAt: OLD_TIME },
    // 自訂動作：本來就會同步，id 不能被動到
    { id: 'custom-machine-row', name: '機械水平划船', muscleGroup: '背', equipment: '機械', isCustom: true, createdAt: OLD_TIME, updatedAt: OLD_TIME },
  ]);

  await legacy.table('workouts').bulkPut([
    {
      id: 'w1',
      startedAt: OLD_TIME,
      status: 'completed',
      updatedAt: OLD_TIME,
      entries: [
        {
          id: 'e1',
          exerciseId: 'rand-bench',
          candidateExerciseIds: ['rand-bench', 'custom-machine-row'],
          order: 0,
          sets: [{ id: 's1', weight: 60, reps: 10, isWarmup: false, completed: true, createdAt: OLD_TIME }],
        },
        { id: 'e2', exerciseId: 'custom-machine-row', order: 1, sets: [] },
      ],
    },
    // 沒有任何舊 id 的訓練不該被改到（updatedAt 保持原值，免得無謂重推雲端）
    {
      id: 'w2',
      startedAt: OLD_TIME,
      status: 'completed',
      updatedAt: OLD_TIME,
      entries: [{ id: 'e3', exerciseId: 'custom-machine-row', order: 0, sets: [] }],
    },
  ]);

  await legacy.table('templates').bulkPut([
    {
      id: 't1',
      name: '拉 (Pull)',
      createdAt: OLD_TIME,
      updatedAt: OLD_TIME,
      entries: [{ id: 'te1', exerciseId: 'rand-row', order: 0, sets: [] }],
    },
  ]);

  legacy.close();
}

describe('Dexie version(9)：內建動作改用確定性 id', () => {
  let db: typeof import('../schema').db;
  let repairExerciseIds: typeof import('../repairExerciseIds').repairExerciseIds;

  beforeAll(async () => {
    await seedLegacyDatabase();
    // 舊庫建好後才載入 App 的 db，讓它跑 8 → 9 升級
    ({ db } = await import('../schema'));
    ({ repairExerciseIds } = await import('../repairExerciseIds'));
    await db.open();
  });

  test('內建動作換成確定性 id，內容不變', async () => {
    const bench = await db.exercises.get('seed:槓鈴臥推') as Exercise;
    expect(bench).toBeDefined();
    expect(bench.name).toBe('槓鈴臥推');
    expect(bench.muscleGroup).toBe('胸');
    expect(bench.isCustom).toBe(false);
    expect(await db.exercises.get('rand-bench')).toBeUndefined();
  });

  test('自訂動作的 id 不動', async () => {
    const custom = await db.exercises.get('custom-machine-row') as Exercise;
    expect(custom).toBeDefined();
    expect(custom.name).toBe('機械水平划船');
  });

  test('動作總數不變（沒有多也沒有少）', async () => {
    expect(await db.exercises.count()).toBe(3);
  });

  test('訓練裡的動作參照被改寫，updatedAt 有 bump', async () => {
    const w1 = await db.workouts.get('w1') as Workout;
    expect(w1.entries[0].exerciseId).toBe('seed:槓鈴臥推');
    expect(w1.entries[0].candidateExerciseIds).toEqual(['seed:槓鈴臥推', 'custom-machine-row']);
    expect(w1.entries[1].exerciseId).toBe('custom-machine-row');
    expect(w1.entries[0].sets[0].weight).toBe(60);   // 組數資料原封不動
    expect(w1.updatedAt as number).toBeGreaterThan(OLD_TIME);
  });

  test('沒動到的訓練不會被無謂 bump', async () => {
    const w2 = await db.workouts.get('w2') as Workout;
    expect(w2.updatedAt).toBe(OLD_TIME);
  });

  test('範本裡的動作參照也被改寫', async () => {
    const t1 = await db.templates.get('t1') as WorkoutTemplate;
    expect(t1.entries[0].exerciseId).toBe('seed:坐姿划船');
    expect(t1.updatedAt).toBeGreaterThan(OLD_TIME);
  });

  test('舊 id 對照表有留下來（供其他裝置修復用）', async () => {
    const alias = await db.idAliases.get('rand-bench') as IdAlias;
    expect(alias.newId).toBe('seed:槓鈴臥推');
    expect(await db.idAliases.count()).toBe(2);   // 只有兩個內建動作
  });

  test('repairExerciseIds 能用別台裝置同步來的對照表修好資料', async () => {
    // 模擬：另一台裝置的對照表被同步下來，而本機有一筆指向對方舊 id 的訓練
    await db.idAliases.put({ id: 'pc-random-row', newId: 'seed:坐姿划船', updatedAt: Date.now() });
    await db.workouts.put({
      id: 'w3',
      startedAt: OLD_TIME,
      status: 'active',
      updatedAt: OLD_TIME,
      entries: [{ id: 'e4', exerciseId: 'pc-random-row', order: 0, sets: [] }],
    });

    const repaired = await repairExerciseIds();
    expect(repaired).toBe(1);

    const w3 = await db.workouts.get('w3') as Workout;
    expect(w3.entries[0].exerciseId).toBe('seed:坐姿划船');
    expect(w3.updatedAt as number).toBeGreaterThan(OLD_TIME);

    // 再跑一次應該沒東西可修（冪等，不會一直 bump updatedAt 造成無限重推）
    expect(await repairExerciseIds()).toBe(0);
  });
});
