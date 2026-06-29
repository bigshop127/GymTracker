import { db, type BodyMetric } from './schema';

export async function listBodyMetrics(): Promise<BodyMetric[]> {
  return db.bodyMetrics.reverse().sortBy('date');
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
  await db.bodyMetrics.delete(id);
}
