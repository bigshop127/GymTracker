import { db, type Workout, type WorkoutTemplate } from './schema';
import { remapEntryExerciseIds } from '../lib/exerciseIdMap';

/**
 * 用 idAliases 對照表，把指向「舊隨機內建動作 id」的訓練與範本修回新的確定性 id。
 *
 * version(9) migration 只能修本機自己生的舊 id；別台裝置同步過來的資料帶的是
 * 對方的舊 id，本機的 exercises 表根本沒有那些 id（UI 會一直顯示「讀取中...」）。
 * idAliases 會跟著同步，所以拉到對方的對照表後在這裡補修。
 *
 * 每次同步完成與 App 啟動時各跑一次；沒東西可修時是純讀取，成本很低。
 *
 * @returns 修好的筆數
 */
export async function repairExerciseIds(): Promise<number> {
  const aliases = await db.idAliases.toArray();
  if (aliases.length === 0) return 0;

  const idMap = new Map(aliases.map((a) => [a.id, a.newId]));
  const now = Date.now();
  let repaired = 0;

  await db.transaction('rw', db.workouts, db.templates, async () => {
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
