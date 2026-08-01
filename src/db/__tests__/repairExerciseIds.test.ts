import 'fake-indexeddb/auto';
import { describe, test, expect, beforeAll } from 'vitest';
import { db, type Workout, type WorkoutTemplate } from '../schema';
import { repairExerciseIds } from '../repairExerciseIds';
import { seedExercisesIfEmpty } from '../exercises';
import { seedExerciseId } from '../../data/seed-exercises';

const OLD_TIME = 1_000_000;

/**
 * 模擬「全新安裝、從沒跑過 Dexie upgrade」的裝置：動作庫是最新的 seed，
 * idAliases 空的，但從雲端拉到的範本／訓練指著早就換掉的 id。
 */
beforeAll(async () => {
  await db.open();
  await seedExercisesIfEmpty();

  await db.exercises.bulkPut([
    { id: 'custom-hori-row', name: '機械水平划船', muscleGroup: '背', equipment: '機械', isCustom: true, createdAt: OLD_TIME, updatedAt: OLD_TIME },
    { id: 'custom-rear-delt', name: '肩膀後三角', muscleGroup: '肩', equipment: '機械', isCustom: true, createdAt: OLD_TIME, updatedAt: OLD_TIME },
  ]);

  // 宗諺「拉 (Pull)」範本：自訂動作查得到，內建動作是別台裝置 v9 之前的隨機 id
  await db.templates.put({
    id: 't-pull',
    name: '拉 (Pull)',
    createdAt: OLD_TIME,
    updatedAt: OLD_TIME,
    entries: [
      { id: 'te0', exerciseId: 'dead-row-uuid', order: 0, sets: [] },
      { id: 'te1', exerciseId: 'dead-pulldown-uuid', order: 1, sets: [] },
      { id: 'te2', exerciseId: 'custom-hori-row', order: 2, sets: [] },
      { id: 'te3', exerciseId: 'dead-pulldown-uuid', order: 3, sets: [] },
      { id: 'te4', exerciseId: 'custom-rear-delt', order: 4, sets: [] },
    ],
  });

  // 進行中的訓練：一格是同一個孤兒 uuid，一格是 v10 改名前的 seed id（本機沒有對照）
  await db.workouts.put({
    id: 'w-active',
    startedAt: OLD_TIME,
    updatedAt: OLD_TIME,
    status: 'active',
    entries: [
      { id: 'we0', exerciseId: 'dead-row-uuid', order: 0, sets: [] },
      { id: 'we1', exerciseId: seedExerciseId('坐姿划船'), order: 1, sets: [] },
    ],
  });
});

describe('repairExerciseIds：查不到的動作 id 自動修復', () => {
  let repaired = 0;

  test('跑一次修復', async () => {
    repaired = await repairExerciseIds();
    expect(repaired).toBeGreaterThan(0);
  });

  test('程式碼內建的改名表能修（不必等 Dexie upgrade 跑過）', async () => {
    const w = await db.workouts.get('w-active') as Workout;
    expect(w.entries[1].exerciseId).toBe(seedExerciseId('坐姿划船（寬握）'));
  });

  test('宗諺範本的孤兒 id 依順序還原', async () => {
    const t = await db.templates.get('t-pull') as WorkoutTemplate;
    expect(t.entries.map((e) => e.exerciseId)).toEqual([
      seedExerciseId('槓鈴划船'),
      seedExerciseId('滑輪下拉（寬握）'),
      'custom-hori-row',
      seedExerciseId('滑輪下拉（寬握）'),
      'custom-rear-delt',
    ]);
    expect(t.updatedAt).toBeGreaterThan(OLD_TIME);
  });

  test('救回來的對照寫進 idAliases（會同步出去，另一台也一起修好）', async () => {
    expect(await db.idAliases.get('dead-row-uuid')).toMatchObject({
      newId: seedExerciseId('槓鈴划船'),
    });
    expect(await db.idAliases.get('dead-pulldown-uuid')).toMatchObject({
      newId: seedExerciseId('滑輪下拉（寬握）'),
    });
  });

  test('同一個孤兒 id 在訓練裡也被一併修好（不只範本）', async () => {
    const w = await db.workouts.get('w-active') as Workout;
    expect(w.entries[0].exerciseId).toBe(seedExerciseId('槓鈴划船'));
    expect(w.updatedAt).toBeGreaterThan(OLD_TIME);
  });

  test('沒東西可修時不再亂 bump updatedAt', async () => {
    const before = (await db.workouts.get('w-active') as Workout).updatedAt;
    const second = await repairExerciseIds();
    expect(second).toBe(0);
    expect((await db.workouts.get('w-active') as Workout).updatedAt).toBe(before);
  });
});
