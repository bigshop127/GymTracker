import { describe, test, expect } from 'vitest';
import {
  isCurrentProgram,
  pauseProgram,
  resumeProgram,
  endProgram,
  restartProgram,
  getElapsedWeeks,
  getPausedDays,
} from '../programLifecycle';
import { type TrainingProgram, type ProgramStatus } from '../../db/schema';

const DAY = 24 * 60 * 60 * 1000;
const WEEK = 7 * DAY;

function makeProgram(overrides: Partial<TrainingProgram> = {}): TrainingProgram {
  return {
    id: 'p1',
    name: '測試計畫',
    slots: [
      { id: 's1', label: '拉', templateId: 't1' },
      { id: 's2', label: '推' },
    ],
    completedSlotIdsThisLap: [],
    cycleCount: 0,
    estimatedWeeks: { min: 4, max: 8 },
    status: 'active',
    startedAt: 1000,
    createdAt: 1000,
    updatedAt: 1000,
    ...overrides,
  };
}

describe('programLifecycle', () => {
  describe('isCurrentProgram', () => {
    test('active 與 paused 是目前計畫，completed 與 abandoned 不是', () => {
      const statuses: [ProgramStatus, boolean][] = [
        ['active', true],
        ['paused', true],
        ['completed', false],
        ['abandoned', false],
      ];
      for (const [status, expected] of statuses) {
        expect(isCurrentProgram(makeProgram({ status }))).toBe(expected);
      }
    });
  });

  describe('pauseProgram', () => {
    test('active -> paused，寫入 pausedAt 與 updatedAt', () => {
      const p = makeProgram({ status: 'active' });
      const now = 5000;
      const paused = pauseProgram(p, now);
      expect(paused.status).toBe('paused');
      expect(paused.pausedAt).toBe(now);
      expect(paused.updatedAt).toBe(now);
    });

    test('已經是 paused 再呼叫一次是冪等的，pausedAt 不變', () => {
      const p = makeProgram({ status: 'paused', pausedAt: 2000, updatedAt: 2000 });
      const result = pauseProgram(p, 9000);
      expect(result.pausedAt).toBe(2000);
      expect(result.updatedAt).toBe(2000);
      expect(result).toBe(p);
    });
  });

  describe('resumeProgram', () => {
    test('paused -> active，清掉 pausedAt，累加 accumulatedPausedMs', () => {
      const p = makeProgram({ status: 'paused', pausedAt: 1000, accumulatedPausedMs: 0 });
      const now = 1000 + 3 * DAY;
      const resumed = resumeProgram(p, now);
      expect(resumed.status).toBe('active');
      expect(resumed.pausedAt).toBeUndefined();
      expect(resumed.accumulatedPausedMs).toBe(3 * DAY);
      expect(resumed.updatedAt).toBe(now);
    });

    test('連續兩次 pause/resume 要累加兩段', () => {
      let p = makeProgram({ status: 'active', startedAt: 0, updatedAt: 0 });
      p = pauseProgram(p, 1000);
      p = resumeProgram(p, 1000 + 2 * DAY); // 累加 2 天
      p = pauseProgram(p, 1000 + 2 * DAY + 5000);
      p = resumeProgram(p, 1000 + 2 * DAY + 5000 + 1 * DAY); // 再累加 1 天
      expect(p.accumulatedPausedMs).toBe(3 * DAY);
    });

    test('非 paused 狀態呼叫是無操作', () => {
      const p = makeProgram({ status: 'active' });
      expect(resumeProgram(p, 9999)).toBe(p);
    });
  });

  describe('getElapsedWeeks', () => {
    test('進行中：扣掉累計暫停時間', () => {
      const p = makeProgram({ status: 'active', startedAt: 0, accumulatedPausedMs: 2 * DAY });
      const now = 4 * WEEK; // 4 週後
      const weeks = getElapsedWeeks(p, now);
      expect(weeks).toBeCloseTo((4 * WEEK - 2 * DAY) / WEEK, 5);
    });

    test('暫停中：時間不再前進，now 往後推 30 天回傳值不變', () => {
      const p = makeProgram({ status: 'paused', startedAt: 0, pausedAt: 2 * WEEK, accumulatedPausedMs: 0 });
      const atPause = getElapsedWeeks(p, 2 * WEEK);
      const muchLater = getElapsedWeeks(p, 2 * WEEK + 30 * DAY);
      expect(atPause).toBeCloseTo(2, 5);
      expect(muchLater).toBe(atPause);
    });

    test('已結束：用 completedAt 當終點', () => {
      const p = makeProgram({ status: 'completed', startedAt: 0, completedAt: 3 * WEEK });
      const weeks = getElapsedWeeks(p, 10 * WEEK); // now 應該被忽略
      expect(weeks).toBeCloseTo(3, 5);
    });
  });

  describe('getPausedDays', () => {
    test('只有 paused 才有意義，其餘回 0', () => {
      expect(getPausedDays(makeProgram({ status: 'active' }), 9999)).toBe(0);
      expect(getPausedDays(makeProgram({ status: 'completed' }), 9999)).toBe(0);
    });

    test('paused：以 pausedAt 算到現在的天數', () => {
      const p = makeProgram({ status: 'paused', pausedAt: 0 });
      expect(getPausedDays(p, 3 * DAY)).toBe(3);
      expect(getPausedDays(p, 3 * DAY + 1000)).toBe(3); // 未滿一天不進位
    });
  });

  describe('endProgram', () => {
    test('completed 與 abandoned 都會寫入 completedAt', () => {
      const p = makeProgram({ status: 'active' });
      const completed = endProgram(p, 5000, 'completed');
      expect(completed.status).toBe('completed');
      expect(completed.completedAt).toBe(5000);

      const abandoned = endProgram(p, 5000, 'abandoned');
      expect(abandoned.status).toBe('abandoned');
      expect(abandoned.completedAt).toBe(5000);
    });

    test('從 paused 結束時，最後那段暫停時間會被結算進 accumulatedPausedMs', () => {
      const p = makeProgram({ status: 'paused', pausedAt: 1000, accumulatedPausedMs: 2 * DAY });
      const now = 1000 + 1 * DAY;
      const ended = endProgram(p, now, 'abandoned');
      expect(ended.accumulatedPausedMs).toBe(2 * DAY + 1 * DAY);
      expect(ended.pausedAt).toBeUndefined();
    });
  });

  describe('restartProgram', () => {
    const p = makeProgram({
      status: 'active',
      cycleCount: 3,
      completedSlotIdsThisLap: ['s1'],
      runNumber: 2,
    });
    const now = 99999;
    const { archived, fresh } = restartProgram(p, now);

    test('archived 標記為 abandoned 並結算暫停時間', () => {
      expect(archived.status).toBe('abandoned');
      expect(archived.completedAt).toBe(now);
    });

    test('fresh 是全新的一份，id 不同、runNumber+1、輪次歸零', () => {
      expect(fresh.id).not.toBe(p.id);
      expect(fresh.status).toBe('active');
      expect(fresh.cycleCount).toBe(0);
      expect(fresh.completedSlotIdsThisLap).toEqual([]);
      expect(fresh.runNumber).toBe(3);
      expect(fresh.restartedFromProgramId).toBe(p.id);
      expect(fresh.startedAt).toBe(now);
      expect(fresh.completedAt).toBeUndefined();
      expect(fresh.pausedAt).toBeUndefined();
      expect(fresh.accumulatedPausedMs).toBe(0);
    });

    test('fresh.slots 的 id 與 templateId 與原本逐一相同（沿用，讓已指定的訓練部位仍對得上）', () => {
      expect(fresh.slots).toHaveLength(p.slots.length);
      fresh.slots.forEach((s, i) => {
        expect(s.id).toBe(p.slots[i].id);
        expect(s.templateId).toBe(p.slots[i].templateId);
      });
      // 深拷貝：不是同一個陣列/物件參照
      expect(fresh.slots).not.toBe(p.slots);
      expect(fresh.slots[0]).not.toBe(p.slots[0]);
    });

    test('runNumber 缺省時視為 1，重新開始後變 2', () => {
      const noRunNumber = makeProgram({ runNumber: undefined });
      const result = restartProgram(noRunNumber, now);
      expect(result.fresh.runNumber).toBe(2);
    });
  });
});
