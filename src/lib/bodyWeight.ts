import { type BodyMetric } from '../db/schema';
import { getLocalDateStr } from './shiftPlan';

// 體重紀錄頁（2026-10-21）：一天一筆，存在既有的 bodyMetrics 表（體重一律存 kg）

export interface WeightPoint {
  id: string;
  dateStr: string;   // 'YYYY-MM-DD'（本地時區）
  date: number;      // BodyMetric.date
  kg: number;
  bodyFatPct?: number;
}

export type WeightRange = '30' | '90' | 'all';

export const WEIGHT_RANGE_OPTIONS: { value: WeightRange; label: string }[] = [
  { value: '30', label: '近 1 個月' },
  { value: '90', label: '近 3 個月' },
  { value: 'all', label: '全部' },
];

/** 'YYYY-MM-DD' → 當天中午的時間戳（存中午，換時區或日光節約也不會跑到前一天） */
export function dateStrToTimestamp(dateStr: string): number {
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(y, m - 1, d, 12).getTime();
}

export function addDays(dateStr: string, days: number): string {
  const [y, m, d] = dateStr.split('-').map(Number);
  return getLocalDateStr(new Date(y, m - 1, d + days).getTime());
}

/**
 * 有體重的紀錄整理成一天一筆、舊→新排序。
 * 兩台裝置同一天各記一筆（同步後會有兩筆）時，留最後改的那筆。
 */
export function toDailyWeights(metrics: BodyMetric[]): WeightPoint[] {
  const byDay = new Map<string, BodyMetric>();
  for (const m of metrics) {
    if (m.deletedAt || typeof m.bodyWeight !== 'number' || !Number.isFinite(m.bodyWeight)) continue;
    const dateStr = getLocalDateStr(m.date);
    const prev = byDay.get(dateStr);
    if (!prev || (m.updatedAt ?? 0) > (prev.updatedAt ?? 0)) byDay.set(dateStr, m);
  }
  return [...byDay.entries()]
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([dateStr, m]) => ({
      id: m.id,
      dateStr,
      date: m.date,
      kg: m.bodyWeight as number,
      ...(typeof m.bodyFatPct === 'number' ? { bodyFatPct: m.bodyFatPct } : {}),
    }));
}

/** 只留最近 N 天內（含今天）的紀錄；'all' 全留 */
export function filterByRange(points: WeightPoint[], range: WeightRange, todayStr: string): WeightPoint[] {
  if (range === 'all') return points;
  const from = addDays(todayStr, -(Number(range) - 1));
  return points.filter((p) => p.dateStr >= from);
}

/**
 * 最新一筆跟「N 天前」比差多少 kg：拿最新那天往前推 N 天、那天或更早的最後一筆來比。
 * 沒有那麼早的紀錄回 null。
 */
export function changeOverDays(points: WeightPoint[], days: number): number | null {
  if (points.length < 2) return null;
  const latest = points[points.length - 1];
  const cutoff = addDays(latest.dateStr, -days);
  for (let i = points.length - 2; i >= 0; i--) {
    if (points[i].dateStr <= cutoff) return latest.kg - points[i].kg;
  }
  return null;
}
