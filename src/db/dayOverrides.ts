import { db, type DayOverride } from './schema';

export async function getDayOverride(dateStr: string): Promise<DayOverride | undefined> {
  const override = await db.dayOverrides.get(dateStr);
  if (!override || override.deletedAt) return undefined;
  return override;
}

export async function listDayOverridesInRange(startDateStr: string, endDateStr: string): Promise<DayOverride[]> {
  const overrides = await db.dayOverrides
    .where('id')
    .between(startDateStr, endDateStr, true, true)
    .toArray();
  return overrides.filter(o => !o.deletedAt);
}

export async function saveDayOverride(input: Omit<DayOverride, 'updatedAt'>): Promise<void> {
  const now = Date.now();
  const newOverride: DayOverride = {
    ...input,
    updatedAt: now,
  };
  // Ensure we clear deletedAt in case of reusing a soft-deleted item
  delete newOverride.deletedAt;
  await db.dayOverrides.put(newOverride);
}

export async function clearDayOverride(dateStr: string): Promise<void> {
  const existing = await db.dayOverrides.get(dateStr);
  if (!existing) return;
  const now = Date.now();
  await db.dayOverrides.put({
    ...existing,
    deletedAt: now,
    updatedAt: now,
  });
}
