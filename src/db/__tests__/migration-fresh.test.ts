import 'fake-indexeddb/auto';
import { describe, test, expect, beforeAll } from 'vitest';
import { db } from '../schema';
import { seedExercisesIfEmpty } from '../exercises';
import { repairExerciseIds } from '../repairExerciseIds';
import { seedExerciseId } from '../../data/seed-exercises';
import { type Exercise } from '../schema';

/**
 * 全新裝置的路徑：沒有任何舊資料，Dexie 直接以最新版本建庫、不跑 upgrade callback。
 * 遷移碼裡任何「假設舊資料存在」的寫法（例如 get() 後直接用 !）都會在這裡爆。
 * 使用者重灌手機 App 走的就是這條。
 */
describe('全新資料庫：直接建在最新版本，不跑遷移', () => {
  beforeAll(async () => {
    await db.open();
  });

  test('開得起來，且版本是 10', () => {
    expect(db.verno).toBe(10);
  });

  test('沒有跑過遷移 → 沒有任何 id 對照，repairExerciseIds 是 no-op', async () => {
    expect(await db.idAliases.count()).toBe(0);
    expect(await repairExerciseIds()).toBe(0);
  });

  test('seed 直接寫入新名稱，舊名稱不存在', async () => {
    await seedExercisesIfEmpty();

    for (const name of ['滑輪下拉（寬握）', '滑輪下拉（窄握）', '坐姿划船（寬握）', '纜繩下壓（繩索）']) {
      expect(await db.exercises.get(seedExerciseId(name))).toBeDefined();
    }
    for (const name of ['滑輪下拉', '坐姿划船', '纜繩下壓', '斜板推']) {
      expect(await db.exercises.get(seedExerciseId(name))).toBeUndefined();
    }
  });

  test('seed 有帶 subGroup，且啞鈴飛鳥在肩', async () => {
    const bicep = await db.exercises.get(seedExerciseId('槓鈴彎舉')) as Exercise;
    expect(bicep.subGroup).toBe('二頭');

    const tricep = await db.exercises.get(seedExerciseId('纜繩下壓（繩索）')) as Exercise;
    expect(tricep.subGroup).toBe('三頭');

    const feiNiao = await db.exercises.get(seedExerciseId('啞鈴飛鳥')) as Exercise;
    expect(feiNiao.muscleGroup).toBe('肩');
  });
});
