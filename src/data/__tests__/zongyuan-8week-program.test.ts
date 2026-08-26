import { describe, test, expect } from 'vitest';
import { ZONGYUAN_8WEEK_PLAN, parseZongYuanWeeklyTargets } from '../zongyuan-8week-program';

describe('parseZongYuanWeeklyTargets', () => {
  test('把「N組 × M下」字串解析成結構化組數/次數', () => {
    const result = parseZongYuanWeeklyTargets(
      ['4組 × 12下', '5組 × 10下'],
      4,
      12
    );
    expect(result).toEqual([
      { sets: 4, reps: 12 },
      { sets: 5, reps: 10 },
    ]);
  });

  test('遇到解析不出來的字串（例如測試週說明），沿用上一筆數字並把原文存進 note', () => {
    const result = parseZongYuanWeeklyTargets(
      ['6組 × 3下', '測試1RM：65%×5, 75%×3, 85%×2, 95%×1'],
      6,
      8
    );
    expect(result[0]).toEqual({ sets: 6, reps: 3 });
    expect(result[1]).toEqual({
      sets: 6,
      reps: 3,
      note: '測試1RM：65%×5, 75%×3, 85%×2, 95%×1',
    });
  });

  test('整份宗諺課表資料都能餵進解析器，且筆數與 weekly 對齊', () => {
    for (const day of ZONGYUAN_8WEEK_PLAN) {
      for (const ex of day.exercises) {
        const targets = parseZongYuanWeeklyTargets(ex.weekly, ex.week1Sets, ex.week1Reps);
        expect(targets).toHaveLength(ex.weekly.length);
        expect(targets[0]).toEqual({ sets: ex.week1Sets, reps: ex.week1Reps });
      }
    }
  });
});
