import type { WorkoutEntry } from '../db/schema';

/**
 * 依 id 對照表就地改寫 entries 內的動作 id（exerciseId 與替代動作候選清單）。
 *
 * 用途：內建動作早期是用 crypto.randomUUID() 生 id，每台裝置各生一套，
 * 於是 A 裝置同步過來的範本／訓練會指到 B 裝置查不到的 id（UI 顯示「讀取中...」）。
 * 改用確定性 id 後，靠這張對照表把舊 id 一次改回來。
 *
 * @returns 是否真的改動了任何一筆（呼叫端據此決定要不要 bump updatedAt）
 */
/**
 * 沿著對照表一路解析到終點（舊 id 可能被改過兩次以上：A→B→C）。
 * 對照表沒收錄就原樣返回。
 */
export function resolveAliasId(id: string, idMap: ReadonlyMap<string, string>): string {
  let current = id;
  const visited = new Set<string>();
  while (idMap.has(current)) {
    if (visited.has(current)) {
      // Break cycle if any (should not happen)
      break;
    }
    visited.add(current);
    current = idMap.get(current)!;
  }
  return current;
}

export function remapEntryExerciseIds(
  entries: WorkoutEntry[] | undefined,
  idMap: Map<string, string>,
): boolean {
  if (!entries || idMap.size === 0) return false;

  const resolveId = (id: string) => resolveAliasId(id, idMap);

  let changed = false;
  for (const entry of entries) {
    const target = resolveId(entry.exerciseId);
    if (target !== entry.exerciseId) {
      entry.exerciseId = target;
      changed = true;
    }

    const candidates = entry.candidateExerciseIds;
    if (candidates) {
      // 換完可能撞在一起（兩個舊 id 指向同一個新 id），順手去重
      const next = [...new Set(candidates.map(resolveId))];
      if (next.length !== candidates.length || next.some((id, i) => id !== candidates[i])) {
        entry.candidateExerciseIds = next;
        changed = true;
      }
    }
  }
  return changed;
}
