import { db, type WorkoutTemplate, type Workout, type TemplateCategory } from './schema';
import { carryAlternatives, clonePlannedSets } from '../lib/workoutEntries';
import { mergeWorkoutIntoTemplate } from '../lib/templateDiff';

export function createTemplateFromWorkout(workout: Workout, name: string): WorkoutTemplate {
  const now = Date.now();
  return {
    id: crypto.randomUUID(),
    name,
    location: workout.location,
    createdAt: now,
    updatedAt: now,
    entries: workout.entries.map((entry) => ({
      id: crypto.randomUUID(),
      exerciseId: entry.exerciseId,
      // 替代動作連同各自的組數/重量一起存，下次開訓每個替代動作都帶自己的數字
      ...carryAlternatives(entry, (sets) => clonePlannedSets(sets, now)),
      order: entry.order,
      defaultRestSeconds: entry.defaultRestSeconds,
      sets: clonePlannedSets(entry.sets, now),
    })),
  };
}

/** 空白範本（手動建立用，之後在範本編輯器裡加動作） */
export function createBlankTemplate(name: string, category?: TemplateCategory, location?: string): WorkoutTemplate {
  const now = Date.now();
  return {
    id: crypto.randomUUID(),
    name,
    ...(category ? { category } : {}),
    ...(location ? { location } : {}),
    entries: [],
    createdAt: now,
    updatedAt: now,
  };
}

/**
 * 用一次訓練的最新內容更新既有範本（保留 id/name/category/createdAt）。
 * 對應得到的動作保留 weeklyTargets（課表的週次漸進），不會因為「更新範本」就被洗掉。
 */
export function updateTemplateFromWorkout(template: WorkoutTemplate, workout: Workout): WorkoutTemplate {
  return mergeWorkoutIntoTemplate(template, workout);
}

export async function listTemplates(): Promise<WorkoutTemplate[]> {
  const templates = await db.templates.reverse().sortBy('createdAt');
  return templates.filter(t => !t.deletedAt);
}

export async function getTemplate(id: string): Promise<WorkoutTemplate | undefined> {
  const template = await db.templates.get(id);
  if (template && template.deletedAt) return undefined;
  return template;
}

/** 連已刪除（軟刪除墓碑）的都讀：用來判斷「課表指到的範本是被刪掉、還是根本不存在」 */
export async function getTemplateIncludingDeleted(id: string): Promise<WorkoutTemplate | undefined> {
  return db.templates.get(id);
}

export async function saveTemplate(template: WorkoutTemplate): Promise<void> {
  await db.templates.put({ ...template, updatedAt: Date.now() });
}

export async function deleteTemplate(id: string): Promise<void> {
  const template = await db.templates.get(id);
  if (!template) return;
  const now = Date.now();
  await db.templates.put({ ...template, deletedAt: now, updatedAt: now });
}

/**
 * 復原被刪除的範本。deletedAt 要明寫成 undefined（不是把鍵拿掉）：
 * 雲端同步是 merge 寫入，鍵存在且為 undefined 才會送 deleteField() 把雲端的刪除標記清掉。
 */
export async function restoreTemplate(id: string): Promise<WorkoutTemplate | undefined> {
  const template = await db.templates.get(id);
  if (!template) return undefined;
  if (!template.deletedAt) return template;
  const restored: WorkoutTemplate = { ...template, deletedAt: undefined, updatedAt: Date.now() };
  await db.templates.put(restored);
  return restored;
}
