import { db, type Workout, type WorkoutTemplate } from './schema';
import { remapEntryExerciseIds } from '../lib/exerciseIdMap';
import { discoverZongYuanAliases } from '../lib/zongYuanIdRescue';
import { STATIC_SEED_ID_ALIASES } from '../data/seed-exercises';

/**
 * 把指向「查不到的動作 id」的訓練與範本修回正確的 id。
 *
 * 對照來源三層，由弱到強疊加：
 * 1. STATIC_SEED_ID_ALIASES（程式碼內建的改名表）——不依賴 Dexie upgrade 跑過，
 *    全新安裝／清過資料的裝置也修得動。
 * 2. db.idAliases（v9/v10 migration 產生，且會參與雲端同步）——修別台裝置留下的舊隨機 id。
 * 3. 宗諺課表的順序反推——上面兩層都救不回來（名稱已無從得知）時的最後手段，
 *    新發現的對照會寫進 idAliases，讓另一台裝置同步後也一起修好。
 *
 * 每次同步完成與 App 啟動時各跑一次；沒東西可修時只是純讀取 + 掃描，成本很低。
 *
 * @returns 修好的筆數
 */
export async function repairExerciseIds(): Promise<number> {
  const [aliases, exercises, templates] = await Promise.all([
    db.idAliases.toArray(),
    db.exercises.toArray(),
    db.templates.toArray(),
  ]);

  const idMap = new Map<string, string>(STATIC_SEED_ID_ALIASES);
  for (const alias of aliases) {
    idMap.set(alias.id, alias.newId);
  }

  const discovered = discoverZongYuanAliases(templates, exercises, idMap);
  for (const [oldId, newId] of discovered) {
    idMap.set(oldId, newId);
  }

  if (idMap.size === 0) return 0;

  const now = Date.now();
  let repaired = 0;

  await db.transaction('rw', db.workouts, db.templates, db.idAliases, async () => {
    if (discovered.size > 0) {
      await db.idAliases.bulkPut(
        [...discovered].map(([id, newId]) => ({ id, newId, updatedAt: now })),
      );
    }

    await db.workouts.toCollection().modify((w: Workout) => {
      if (remapEntryExerciseIds(w.entries, idMap)) {
        w.updatedAt = now;   // bump 讓修好的版本推得上雲端，對面才拉得到
        repaired++;
      }
    });
    await db.templates.toCollection().modify((t: WorkoutTemplate) => {
      if (remapEntryExerciseIds(t.entries, idMap)) {
        t.updatedAt = now;
        repaired++;
      }
    });
  });

  return repaired;
}
