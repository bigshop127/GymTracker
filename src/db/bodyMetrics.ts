import { db, type BodyMetric } from './schema';

/**
 * 取得所有體量紀錄，依日期降冪排序
 */
export async function listBodyMetrics(): Promise<BodyMetric[]> {
  return db.bodyMetrics.reverse().sortBy('date');
}

/**
 * 新增體量紀錄
 */
export async function addBodyMetric(metric: Omit<BodyMetric, 'id'>): Promise<string> {
  const id = crypto.randomUUID();
  const newMetric: BodyMetric = {
    ...metric,
    id,
  };
  await db.bodyMetrics.add(newMetric);
  return id;
}

/**
 * 更新體量紀錄
 */
export async function updateBodyMetric(id: string, updates: Partial<Omit<BodyMetric, 'id'>>): Promise<void> {
  await db.bodyMetrics.update(id, updates);
}

/**
 * 刪除體量紀錄
 */
export async function deleteBodyMetric(id: string): Promise<void> {
  await db.bodyMetrics.delete(id);
}
