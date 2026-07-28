import { db, type BodyMetric } from './schema';

export async function listBodyMetrics(): Promise<BodyMetric[]> {
  const metrics = await db.bodyMetrics.reverse().sortBy('date');
  return metrics.filter(m => !m.deletedAt);
}

export async function addBodyMetric(metric: Omit<BodyMetric, 'id' | 'updatedAt' | 'deletedAt'>): Promise<string> {
  const id = crypto.randomUUID();
  const now = Date.now();
  const newMetric: BodyMetric = { ...metric, id, updatedAt: now };
  await db.bodyMetrics.add(newMetric);
  return id;
}

export async function updateBodyMetric(id: string, updates: Partial<Omit<BodyMetric, 'id'>>): Promise<void> {
  await db.bodyMetrics.update(id, { ...updates, updatedAt: Date.now() });
}

export async function deleteBodyMetric(id: string): Promise<void> {
  const metric = await db.bodyMetrics.get(id);
  if (!metric) return;
  const now = Date.now();
  await db.bodyMetrics.put({ ...metric, deletedAt: now, updatedAt: now });
}
