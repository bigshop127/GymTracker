import { describe, test, expect } from 'vitest';
import {
  buildWeeklyColumns,
  countByCategory,
  getValidDurationMinutes,
  groupByWeek,
  inMonth,
  summarizePeriod,
  type CategorizedWorkout,
  type HistoryCategory,
} from '../historyStats';
import { type SetLog, type Workout } from '../../db/schema';

const MIN = 60 * 1000;

function set(extra: Partial<SetLog> = {}): SetLog {
  return { id: crypto.randomUUID(), weight: 50, reps: 10, isWarmup: false, completed: true, createdAt: 0, ...extra };
}
function w(id: string, y: number, m: number, d: number, minutes?: number, sets: SetLog[] = [set()]): Workout {
  const startedAt = new Date(y, m - 1, d, 18).getTime();
  return {
    id,
    startedAt,
    ...(minutes !== undefined ? { endedAt: startedAt + minutes * MIN } : {}),
    status: 'completed',
    entries: [{ id: `${id}-e`, exerciseId: 'x', order: 0, sets }],
  };
}
function item(workout: Workout, category: HistoryCategory): CategorizedWorkout {
  return { workout, category };
}

describe('getValidDurationMinutes', () => {
  test('正常時長照算；沒結束、超過 4 小時（忘了按結束）回 null', () => {
    expect(getValidDurationMinutes(w('a', 2026, 9, 22, 76))).toBe(76);
    expect(getValidDurationMinutes(w('b', 2026, 9, 22))).toBeNull();
    expect(getValidDurationMinutes(w('c', 2026, 7, 31, 3557))).toBeNull();
  });
});

describe('buildWeeklyColumns', () => {
  test('近 8 週（週日起算）每週一欄，舊的在左；同週照 推拉手腿其他 排', () => {
    const now = new Date(2026, 9, 2, 12).getTime(); // 10/2（五），本週從 9/27（日）開始
    const columns = buildWeeklyColumns([
      item(w('leg', 2026, 9, 29), '腿'),
      item(w('push', 2026, 9, 30), '推'),
      item(w('pull', 2026, 9, 22), '拉'),
      item(w('too-old', 2026, 7, 1), '推'),
    ], now);

    expect(columns).toHaveLength(8);
    expect(columns[7].weekStart).toBe('2026-09-27');
    expect(columns[7].weekEnd).toBe('2026-10-03');
    expect(columns[0].weekStart).toBe('2026-08-09');
    expect(columns[7].items.map((i) => i.workout.id)).toEqual(['push', 'leg']);
    expect(columns[6].items.map((i) => i.workout.id)).toEqual(['pull']);
    expect(columns.flatMap((c) => c.items).some((i) => i.workout.id === 'too-old')).toBe(false);
  });
});

describe('countByCategory / inMonth / summarizePeriod', () => {
  const items = [
    item(w('a', 2026, 9, 1, 60), '推'),
    item(w('b', 2026, 9, 3, 80, [set(), set({ isWarmup: true }), set()]), '推'),
    item(w('c', 2026, 9, 5, 3557), '拉'),
    item(w('d', 2026, 10, 1, 50), '手'),
  ];

  test('某個月各分類次數', () => {
    const sep = inMonth(items, 2026, 9);
    expect(sep).toHaveLength(3);
    expect(countByCategory(sep)).toEqual({ 推: 2, 拉: 1, 手: 0, 腿: 0, 其他: 0 });
  });

  test('摘要：次數、正式組數，平均時長不算忘了結束的那筆', () => {
    expect(summarizePeriod(inMonth(items, 2026, 9).map((i) => i.workout))).toEqual({
      count: 3, workingSets: 4, avgMinutes: 70,
    });
    expect(summarizePeriod([w('x', 2026, 9, 1)]).avgMinutes).toBeNull();
  });
});

describe('groupByWeek', () => {
  test('依週分段、新的週在前，週內維持傳入順序', () => {
    const groups = groupByWeek([
      item(w('9/30', 2026, 9, 30), '推'),
      item(w('9/28', 2026, 9, 28), '拉'),
      item(w('9/22', 2026, 9, 22), '手'),
    ]);
    expect(groups.map((g) => [g.weekStart, g.weekEnd, g.items.map((i) => i.workout.id)])).toEqual([
      ['2026-09-27', '2026-10-03', ['9/30', '9/28']],
      ['2026-09-20', '2026-09-26', ['9/22']],
    ]);
  });
});
