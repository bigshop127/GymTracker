import { describe, test, expect } from 'vitest';
import { normalizeSplit, getSplitRotationStatus } from '../splitRotation';
import { type Workout, type TrainingProgram } from '../../db/schema';

describe('Split Rotation Library', () => {
  describe('normalizeSplit', () => {
    test('correctly normalizes standard labels with English suffix', () => {
      expect(normalizeSplit('拉 (Pull)')).toBe('拉');
      expect(normalizeSplit('推 (Push)')).toBe('推');
      expect(normalizeSplit('腿 (Leg)')).toBe('腿');
      expect(normalizeSplit('手 (Arms)')).toBe('手');
    });

    test('correctly normalizes default slots names', () => {
      expect(normalizeSplit('背日')).toBe('拉');
      expect(normalizeSplit('胸日')).toBe('推');
      expect(normalizeSplit('肩日')).toBe('推');
      expect(normalizeSplit('腿臀日')).toBe('腿');
      expect(normalizeSplit('手臂日')).toBe('手');
    });

    test('correctly handles compound push/leg words like 腿推 and 臀推', () => {
      expect(normalizeSplit('腿推')).toBe('腿');
      expect(normalizeSplit('臀推')).toBe('腿');
    });

    test('returns null for unrecognizable names', () => {
      expect(normalizeSplit('有氧')).toBe(null);
      expect(normalizeSplit('')).toBe(null);
      expect(normalizeSplit(undefined)).toBe(null);
    });
  });

  describe('getSplitRotationStatus', () => {
    const mockProgram: TrainingProgram = {
      id: 'p1',
      name: '宗諺8週計畫',
      slots: [
        { id: 's1', label: '拉 (Pull)' },
        { id: 's2', label: '推 (Push)' },
        { id: 's3', label: '腿 (Leg)' },
        { id: 's4', label: '手 (Arms)' },
      ],
      cursor: 0,
      cycleCount: 0,
      estimatedWeeks: { min: 8, max: 12 },
      status: 'active',
      startedAt: 1000,
      createdAt: 1000,
      updatedAt: 1000,
    };

    test('returns empty status structure when there are no workouts', () => {
      const statuses = getSplitRotationStatus([], mockProgram, Date.now());
      expect(statuses).toHaveLength(4);
      statuses.forEach((status) => {
        expect(status.lastTrainedAt).toBeNull();
        expect(status.daysAgo).toBeNull();
        expect(status.doneInWindow).toBe(false);
      });
    });

    test('correctly maps workouts in 7 days window', () => {
      const now = new Date('2026-07-23T12:00:00Z').getTime();
      const oneDay = 24 * 60 * 60 * 1000;

      const workouts: Workout[] = [
        {
          id: 'w1',
          startedAt: now - 2 * oneDay, // 2 days ago
          status: 'completed',
          entries: [],
          programSlotId: 's3', // Leg
        },
        {
          id: 'w2',
          startedAt: now - 6 * oneDay, // 6 days ago
          status: 'completed',
          entries: [],
          programSlotId: 's1', // Pull
        },
        {
          id: 'w3',
          startedAt: now - 8 * oneDay, // 8 days ago (outside window)
          status: 'completed',
          entries: [],
          programSlotId: 's2', // Push
        }
      ];

      const status = getSplitRotationStatus(workouts, mockProgram, now);

      // 拉 (s1) was trained 6 days ago -> doneInWindow should be true
      const pullStatus = status.find(s => s.category === '拉');
      expect(pullStatus?.doneInWindow).toBe(true);
      expect(pullStatus?.daysAgo).toBe(6);

      // 推 (s2) was trained 8 days ago -> doneInWindow should be false
      const pushStatus = status.find(s => s.category === '推');
      expect(pushStatus?.doneInWindow).toBe(false);
      expect(pushStatus?.daysAgo).toBe(8);

      // 腿 (s3) was trained 2 days ago -> doneInWindow should be true
      const legStatus = status.find(s => s.category === '腿');
      expect(legStatus?.doneInWindow).toBe(true);
      expect(legStatus?.daysAgo).toBe(2);

      // 手 (s4) has no workout -> doneInWindow should be false
      const armsStatus = status.find(s => s.category === '手');
      expect(armsStatus?.doneInWindow).toBe(false);
      expect(armsStatus?.lastTrainedAt).toBeNull();
      expect(armsStatus?.daysAgo).toBeNull();
    });

    test('verifies 7 days boundary (6.9 days is done, 7.1 days is not)', () => {
      const now = new Date('2026-07-23T12:00:00Z').getTime();
      const oneDay = 24 * 60 * 60 * 1000;

      const workouts: Workout[] = [
        {
          id: 'w1',
          startedAt: now - 6.9 * oneDay, // inside 7 days window
          status: 'completed',
          entries: [],
          programSlotId: 's1', // Pull
        },
        {
          id: 'w2',
          startedAt: now - 7.1 * oneDay, // outside window
          status: 'completed',
          entries: [],
          programSlotId: 's2', // Push
        }
      ];

      const status = getSplitRotationStatus(workouts, mockProgram, now);
      expect(status.find(s => s.category === '拉')?.doneInWindow).toBe(true);
      expect(status.find(s => s.category === '推')?.doneInWindow).toBe(false);
    });

    test('verifies calendar day normalization (daysAgo)', () => {
      // July 23, 08:00 AM local
      const now = new Date('2026-07-23T08:00:00+08:00').getTime();
      // July 22, 11:00 PM local (same time zone offset)
      const trainedAt = new Date('2026-07-22T23:00:00+08:00').getTime();

      const workouts: Workout[] = [
        {
          id: 'w1',
          startedAt: trainedAt,
          status: 'completed',
          entries: [],
          programSlotId: 's1', // Pull
        }
      ];

      const status = getSplitRotationStatus(workouts, mockProgram, now);
      const pullStatus = status.find(s => s.category === '拉');
      expect(pullStatus?.daysAgo).toBe(1); // 1 calendar day ago, not 0
    });
  });
});
