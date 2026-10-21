import { describe, test, expect } from 'vitest';
import { type BodyMetric } from '../../db/schema';
import {
  addDays,
  changeOverDays,
  dateStrToTimestamp,
  filterByRange,
  toDailyWeights,
  type WeightPoint,
} from '../bodyWeight';
import { getLocalDateStr } from '../shiftPlan';

const metric = (id: string, dateStr: string, kg?: number, extra: Partial<BodyMetric> = {}): BodyMetric => ({
  id,
  date: dateStrToTimestamp(dateStr),
  ...(kg !== undefined ? { bodyWeight: kg } : {}),
  updatedAt: 1,
  ...extra,
});

const point = (dateStr: string, kg: number): WeightPoint => ({
  id: dateStr,
  dateStr,
  date: dateStrToTimestamp(dateStr),
  kg,
});

describe('bodyWeight', () => {
  test('dateStrToTimestamp／addDays：存當天中午，換回日期還是同一天；跨月加減正確', () => {
    expect(getLocalDateStr(dateStrToTimestamp('2026-10-21'))).toBe('2026-10-21');
    expect(addDays('2026-10-31', 1)).toBe('2026-11-01');
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28');
  });

  test('toDailyWeights：舊→新排序、排除刪除的與沒有體重的、同一天留最後改的那筆', () => {
    const result = toDailyWeights([
      metric('b', '2026-10-21', 72.4, { updatedAt: 5 }),
      metric('a', '2026-10-21', 72.0, { updatedAt: 9 }),
      metric('c', '2026-10-19', 73.1, { bodyFatPct: 18.5 }),
      metric('d', '2026-10-20', 99, { deletedAt: 3 }),
      metric('e', '2026-10-18'), // 只有體脂、沒有體重
    ]);
    expect(result.map((p) => [p.dateStr, p.kg])).toEqual([
      ['2026-10-19', 73.1],
      ['2026-10-21', 72.0],
    ]);
    expect(result[0].bodyFatPct).toBe(18.5);
    expect(result[1].id).toBe('a');
  });

  test('filterByRange：近 30 天含今天、全部不過濾', () => {
    const points = [point('2026-09-21', 74), point('2026-09-22', 73.8), point('2026-10-21', 72)];
    expect(filterByRange(points, '30', '2026-10-21').map((p) => p.dateStr)).toEqual(['2026-09-22', '2026-10-21']);
    expect(filterByRange(points, 'all', '2026-10-21')).toHaveLength(3);
  });

  test('changeOverDays：最新一筆跟 N 天前（或更早最近的一筆）比；沒有那麼早的紀錄回 null', () => {
    const points = [point('2026-10-01', 74), point('2026-10-12', 73.5), point('2026-10-15', 73), point('2026-10-21', 72.2)];
    expect(changeOverDays(points, 7)).toBeCloseTo(72.2 - 73.5); // 10/14 以前最後一筆＝10/12
    expect(changeOverDays(points, 20)).toBeCloseTo(72.2 - 74);
    expect(changeOverDays(points, 30)).toBeNull();
    expect(changeOverDays([point('2026-10-21', 72)], 7)).toBeNull();
  });
});
