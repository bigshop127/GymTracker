import { describe, test, expect } from 'vitest';
import { normalizeSplit, getSplitRotationStatus, getTemplateCategory, groupTemplatesByCategory } from '../splitRotation';
import { type Workout, type TrainingProgram, type WorkoutTemplate } from '../../db/schema';

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
      completedSlotIdsThisLap: [],
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

  describe('getTemplateCategory (Phase 29)', () => {
    function makeTemplate(overrides: Partial<WorkoutTemplate> = {}): WorkoutTemplate {
      return {
        id: 't1',
        name: '訓練',
        entries: [],
        createdAt: 1000,
        updatedAt: 1000,
        ...overrides,
      };
    }

    test('明確設定 category 時，即使 name 含其他分類關鍵字，仍以 category 為準', () => {
      const t = makeTemplate({ name: '推 (Push)', category: '自訂' });
      expect(getTemplateCategory(t)).toBe('自訂');
    });

    test('沒有 category 時退回 normalizeSplit(name)', () => {
      expect(getTemplateCategory(makeTemplate({ name: '背部訓練' }))).toBe('拉');
      expect(getTemplateCategory(makeTemplate({ name: '胸 + 三頭' }))).toBe('推');
    });

    test('name 判不出來且沒有 category → 回傳自訂', () => {
      expect(getTemplateCategory(makeTemplate({ name: '核心強化' }))).toBe('自訂');
      expect(getTemplateCategory(makeTemplate({ name: '8/15 核心' }))).toBe('自訂');
    });
  });

  describe('groupTemplatesByCategory (Phase 29)', () => {
    function makeTemplate(id: string, overrides: Partial<WorkoutTemplate> = {}): WorkoutTemplate {
      return {
        id,
        name: '訓練',
        entries: [],
        createdAt: 1000,
        updatedAt: 1000,
        ...overrides,
      };
    }

    test('5 個 key 一律存在，沒有範本的分類回傳空陣列（不是 undefined）', () => {
      const grouped = groupTemplatesByCategory([]);
      expect(Object.keys(grouped).sort()).toEqual(['手', '推', '拉', '腿', '自訂'].sort());
      for (const cat of ['拉', '推', '腿', '手', '自訂'] as const) {
        expect(grouped[cat]).toEqual([]);
      }
    });

    test('保留傳入陣列的原始相對順序，不做二次排序', () => {
      const templates = [
        makeTemplate('a', { name: '拉 (Pull) 舊', createdAt: 3000 }),
        makeTemplate('b', { name: '推 (Push)', createdAt: 2000 }),
        makeTemplate('c', { name: '拉 (Pull) 新', createdAt: 1000 }),
      ];
      const grouped = groupTemplatesByCategory(templates);
      expect(grouped['拉'].map(t => t.id)).toEqual(['a', 'c']);
      expect(grouped['推'].map(t => t.id)).toEqual(['b']);
    });
  });
});
