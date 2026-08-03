import { type WorkoutTemplate, type Exercise } from '../db/schema';

/**
 * 有氧範本 = 至少有一個動作，且**所有** entry 對應的動作都是 muscleGroup === '有氧'。
 * 查不到對應動作（孤兒 id）一律視為「非有氧」——寧可漏抓，也不要把混合範本錯放進有氧清單。
 */
export function isCardioTemplate(template: WorkoutTemplate, exMap: Map<string, Exercise>): boolean {
  if (template.entries.length === 0) return false;
  return template.entries.every((entry) => exMap.get(entry.exerciseId)?.muscleGroup === '有氧');
}

/** 過濾出有氧範本，維持傳入順序（listTemplates 已是 createdAt 由新到舊） */
export function filterCardioTemplates(
  templates: WorkoutTemplate[],
  exMap: Map<string, Exercise>
): WorkoutTemplate[] {
  return templates.filter((t) => isCardioTemplate(t, exMap));
}

/** 範本的有氧總時長（分鐘，四捨五入）。沒有任何 durationSeconds 時回 0。 */
export function getTemplateTotalMinutes(template: WorkoutTemplate): number {
  const totalSeconds = template.entries.reduce(
    (sum, entry) => sum + entry.sets.reduce((s, setLog) => s + (setLog.durationSeconds ?? 0), 0),
    0
  );
  return Math.round(totalSeconds / 60);
}
