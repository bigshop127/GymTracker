import type { Exercise, WorkoutTemplate } from '../db/schema';
import { ZONGYUAN_8WEEK_PLAN } from '../data/zongyuan-8week-program';
import { resolveAliasId } from './exerciseIdMap';

/**
 * 救回「名稱已經無從得知」的孤兒動作參照。
 *
 * 背景：WorkoutEntry 只存 exerciseId，不存名稱。v9 之前內建動作的 id 是每台裝置
 * 各自 crypto.randomUUID() 生的，匯入宗諺課表時寫進範本的就是那台裝置的隨機 id；
 * 範本會同步、內建動作不會，對方裝置因此查不到 → UI 卡「未知動作」。
 * 而 idAliases 只有「當時還存在那筆舊動作列」的裝置生得出來，那台一旦清過資料，
 * 對照就永遠不存在，任何自動修復都救不回來。
 *
 * 但宗諺課表的 4 個範本有權威名單（ZONGYUAN_8WEEK_PLAN），只要範本結構沒被改過，
 * 就能用「範本名 + entry 順序」反推每一格原本是哪個動作，把 id 重新綁回去。
 *
 * 防呆（任何一項不成立就整個範本跳過，寧可讓使用者手動指定，也不要綁錯動作）：
 * - 範本名稱要對得上課表某一天的 label
 * - entry 筆數要與該天的動作數一致（使用者增刪過動作就不碰）
 * - 所有「查得到的」entry，其動作名稱必須與課表同一格一致（順序被調動過就不碰）
 *
 * @param knownAliases 既有對照（內建 + DB），用來判斷某個 id 是不是真的已經沒救
 * @returns 新發現的對照（孤兒 id → 正確 id）；呼叫端負責寫進 idAliases 並套用
 */
export function discoverZongYuanAliases(
  templates: WorkoutTemplate[],
  exercises: Exercise[],
  knownAliases: ReadonlyMap<string, string>,
): Map<string, string> {
  const live = exercises.filter((e) => !e.deletedAt);
  const liveById = new Map(live.map((e) => [e.id, e]));

  // 同名多筆時以內建動作優先（自訂的可能是別台裝置匯入時建的重複品）
  const idByName = new Map<string, string>();
  for (const ex of live) {
    const existing = idByName.get(ex.name);
    if (existing === undefined || (liveById.get(existing)?.isCustom && !ex.isCustom)) {
      idByName.set(ex.name, ex.id);
    }
  }

  const planByLabel = new Map(
    ZONGYUAN_8WEEK_PLAN.map((day) => [day.label, day.exercises.map((e) => e.exerciseName)]),
  );

  const discovered = new Map<string, string>();

  for (const template of templates) {
    if (template.deletedAt) continue;

    const planNames = planByLabel.get(template.name);
    if (!planNames) continue;

    const entries = [...template.entries].sort((a, b) => a.order - b.order);
    if (entries.length !== planNames.length) continue;

    const orphans: { deadId: string; targetId: string }[] = [];
    let structureIntact = true;

    for (const [index, entry] of entries.entries()) {
      const resolved = resolveAliasId(entry.exerciseId, knownAliases);
      const found = liveById.get(resolved);

      if (found) {
        // 查得到 → 拿來驗證順序沒被動過
        if (found.name !== planNames[index]) {
          structureIntact = false;
          break;
        }
        continue;
      }

      const targetId = idByName.get(planNames[index]);
      if (targetId) {
        orphans.push({ deadId: resolved, targetId });
      }
    }

    if (!structureIntact) continue;
    for (const { deadId, targetId } of orphans) {
      discovered.set(deadId, targetId);
    }
  }

  return discovered;
}
