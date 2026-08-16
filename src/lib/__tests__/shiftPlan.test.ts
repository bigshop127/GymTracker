import { describe, test, expect } from 'vitest';
import {
  classifyShiftCode,
  generateMonthPlan,
  getCalendarDaysDiff,
  getValidDatesInRange,
} from '../shiftPlan';
import {
  type DayOverride,
  type TrainingProgram,
  type Workout,
  type Exercise
} from '../../db/schema';
import { buildExerciseMap } from '../workoutSummary';

const now = new Date('2026-08-16T12:00:00+08:00').getTime(); // 1786852800000 approx

function makeExercise(id: string, name: string, muscleGroup: Exercise['muscleGroup']): Exercise {
  return { id, name, muscleGroup, equipment: '其他', isCustom: false, createdAt: now };
}

const exercises: Exercise[] = [
  makeExercise('run', '跑步機', '有氧'),
  makeExercise('bench', '槓鈴臥推', '胸'),
  makeExercise('squat', '深蹲', '腿臀'),
];
const exMap = buildExerciseMap(exercises);

describe('shiftPlan', () => {
  describe('getCalendarDaysDiff', () => {
    test('正確計算日曆天數差', () => {
      expect(getCalendarDaysDiff('2026-08-16', '2026-08-16')).toBe(0);
      expect(getCalendarDaysDiff('2026-08-16', '2026-08-17')).toBe(1);
      expect(getCalendarDaysDiff('2026-08-10', '2026-08-17')).toBe(7);
    });
  });

  describe('classifyShiftCode', () => {
    test('輸入順序不同 [A, B] 與 [B, A] 應正規化為同一個 key', () => {
      const o1: DayOverride = { id: '2026-08-17', shiftLetters: ['A', 'B'], updatedAt: now };
      const o2: DayOverride = { id: '2026-08-17', shiftLetters: ['B', 'A'], updatedAt: now };
      expect(classifyShiftCode(o1, undefined)).toBe('restOrCardio');
      expect(classifyShiftCode(o2, undefined)).toBe('restOrCardio');
    });

    test('isDayOff 優先於 shiftLetters', () => {
      const o: DayOverride = { id: '2026-08-17', shiftLetters: ['A'], isDayOff: true, updatedAt: now };
      expect(classifyShiftCode(o, undefined)).toBe('train');
    });

    test('查無代碼 fallback 到預設對照表', () => {
      const o: DayOverride = { id: '2026-08-17', shiftLetters: ['C'], updatedAt: now };
      expect(classifyShiftCode(o, undefined)).toBe('train');
    });

    test('使用自訂 policyOverrides', () => {
      const o: DayOverride = { id: '2026-08-17', shiftLetters: ['A'], updatedAt: now };
      const overrides = { 'A': 'restOrCardio' as const };
      expect(classifyShiftCode(o, overrides)).toBe('restOrCardio');
    });
  });

  describe('generateMonthPlan', () => {
    const program: TrainingProgram = {
      id: 'prog-1',
      name: '測試計畫',
      slots: [
        { id: 'slot-胸', label: '胸' },
        { id: 'slot-背', label: '背' },
        { id: 'slot-腿', label: '腿' },
      ],
      cursor: 0,
      cycleCount: 0,
      estimatedWeeks: { min: 4, max: 8 },
      status: 'active',
      startedAt: now,
      createdAt: now,
      updatedAt: now,
    };

    test('沒有 activeProgram 時建議為 noProgram 且不崩潰', () => {
      const result = generateMonthPlan({
        dateStrings: ['2026-08-16', '2026-08-17'],
        activeProgram: null,
        completedWorkouts: [],
        activeWorkoutToday: null,
        overridesByDate: new Map(),
        policyOverrides: undefined,
        restOverrideDays: 7,
        exerciseMap: exMap,
        today: new Date('2026-08-16').getTime(),
      });

      expect(result).toHaveLength(2);
      expect(result[0].suggestion).toBe('noProgram');
      expect(result[1].suggestion).toBe('noProgram');
    });

    test('連續 AB 班未達門檻為 restOrCardio，達門檻強制 train 且 cursor 不漏跳', () => {
      // 假設 8/16（今天）是基準點。8/17 ~ 8/25 連續 9 天 AB 班。門檻是 7 天。
      // 最近一次重訓是 8/15 (daysSinceWeights=1)
      const lastWorkout: Workout = {
        id: 'w-last',
        startedAt: new Date('2026-08-15T10:00:00').getTime(),
        status: 'completed',
        entries: [{ id: 'e1', exerciseId: 'bench', order: 0, sets: [] }],
      };

      const overrides = new Map<string, DayOverride>();
      const dates: string[] = [];
      for (let i = 16; i <= 25; i++) {
        const dStr = `2026-08-${i}`;
        dates.push(dStr);
        overrides.set(dStr, { id: dStr, shiftLetters: ['A', 'B'], updatedAt: now });
      }

      // 我們希望模擬 8/16 ~ 8/25 的結果
      const result = generateMonthPlan({
        dateStrings: dates,
        activeProgram: program,
        completedWorkouts: [lastWorkout],
        activeWorkoutToday: null,
        overridesByDate: overrides,
        policyOverrides: undefined,
        restOverrideDays: 7,
        exerciseMap: exMap,
        today: new Date('2026-08-16').getTime(),
      });

      // 8/15 練過 (daysSinceWeights = 1)
      // 8/16: AB -> restOrCardio (daysSinceWeights 增為 2)
      // 8/17: AB -> restOrCardio (3)
      // 8/18: AB -> restOrCardio (4)
      // 8/19: AB -> restOrCardio (5)
      // 8/20: AB -> restOrCardio (6)
      // 8/21: AB -> restOrCardio (7) -> 達門檻！強制變 train，建議 slot-0 (胸)，daysSinceWeights 歸零。
      // 8/22: AB -> restOrCardio (1)
      // 8/23: AB -> restOrCardio (2)
      // 8/24: AB -> restOrCardio (3)
      // 8/25: AB -> restOrCardio (4)

      expect(result[1].dateStr).toBe('2026-08-17');
      expect(result[1].suggestion).toBe('restOrCardio');

      // 8/22 應該是強制訓練胸 (index 6)
      expect(result[6].dateStr).toBe('2026-08-22');
      expect(result[6].suggestion).toBe('train');
      expect(result[6].suggestedSlot?.label).toBe('胸');

      // 8/23 應該又變回休息有氧 (index 7)
      expect(result[7].dateStr).toBe('2026-08-23');
      expect(result[7].suggestion).toBe('restOrCardio');
    });

    test('paused 日期不推進 simCursor 且增加 daysSinceWeights', () => {
      const overrides = new Map<string, DayOverride>();
      overrides.set('2026-08-17', { id: '2026-08-17', paused: true, updatedAt: now }); // 暫停天
      overrides.set('2026-08-18', { id: '2026-08-18', shiftLetters: ['A'], updatedAt: now }); // A單班 -> train

      const result = generateMonthPlan({
        dateStrings: ['2026-08-17', '2026-08-18'],
        activeProgram: program,
        completedWorkouts: [],
        activeWorkoutToday: null,
        overridesByDate: overrides,
        policyOverrides: undefined,
        restOverrideDays: 7,
        exerciseMap: exMap,
        today: new Date('2026-08-16').getTime(),
      });

      expect(result[0].dateStr).toBe('2026-08-17');
      expect(result[0].suggestion).toBe('paused');

      expect(result[1].dateStr).toBe('2026-08-18');
      expect(result[1].suggestion).toBe('train');
      expect(result[1].suggestedSlot?.label).toBe('胸'); // 依然拿到第 1 個 slot，沒有因為暫停被跳過
    });

    test('純有氧訓練不重置 daysSinceWeights，重訓/混合會重置', () => {
      const cardioWorkout: Workout = {
        id: 'w-cardio',
        startedAt: new Date('2026-08-15T10:00:00').getTime(),
        endedAt: new Date('2026-08-15T11:00:00').getTime(),
        status: 'completed',
        entries: [{ id: 'e-c', exerciseId: 'run', order: 0, sets: [] }],
      };

      const weightWorkoutOn14: Workout = {
        id: 'w-weight-14',
        startedAt: new Date('2026-08-14T10:00:00').getTime(),
        endedAt: new Date('2026-08-14T11:00:00').getTime(),
        status: 'completed',
        entries: [{ id: 'e-w-14', exerciseId: 'bench', order: 0, sets: [] }],
      };

      const overrides = new Map<string, DayOverride>();
      overrides.set('2026-08-16', { id: '2026-08-16', shiftLetters: ['A', 'B'], updatedAt: now });
      overrides.set('2026-08-17', { id: '2026-08-17', shiftLetters: ['A', 'B'], updatedAt: now });

      // 情境一：最近一次重訓是 8/14，而 8/15 只有純有氧。
      // 計算 daysSinceWeights 是看 8/14，到今天 8/16 為 2 天，到明 8/17 為 3 天。
      // 設定門檻為 3，因此 8/17 的 AB 班應該被強制轉為 train。
      const resultWithCardio = generateMonthPlan({
        dateStrings: ['2026-08-16', '2026-08-17'],
        activeProgram: program,
        completedWorkouts: [cardioWorkout, weightWorkoutOn14],
        activeWorkoutToday: null,
        overridesByDate: overrides,
        policyOverrides: undefined,
        restOverrideDays: 3,
        exerciseMap: exMap,
        today: new Date('2026-08-16').getTime(),
      });

      expect(resultWithCardio[1].dateStr).toBe('2026-08-17');
      expect(resultWithCardio[1].suggestion).toBe('train'); // 達 3 天門檻被轉為訓練

      // 情境二：如果 8/15 是重訓（不是有氧），那到 8/17 只有 2 天沒練。
      // 門檻為 3，因此 8/17 的 AB 班應該保持為 restOrCardio。
      const weightWorkoutOn15: Workout = {
        id: 'w-weight-15',
        startedAt: new Date('2026-08-15T10:00:00').getTime(),
        endedAt: new Date('2026-08-15T11:00:00').getTime(),
        status: 'completed',
        entries: [{ id: 'e-w-15', exerciseId: 'bench', order: 0, sets: [] }],
      };

      const resultWithWeightOn15 = generateMonthPlan({
        dateStrings: ['2026-08-16', '2026-08-17'],
        activeProgram: program,
        completedWorkouts: [weightWorkoutOn15, weightWorkoutOn14],
        activeWorkoutToday: null,
        overridesByDate: overrides,
        policyOverrides: undefined,
        restOverrideDays: 3,
        exerciseMap: exMap,
        today: new Date('2026-08-16').getTime(),
      });

      expect(resultWithWeightOn15[1].dateStr).toBe('2026-08-17');
      expect(resultWithWeightOn15[1].suggestion).toBe('restOrCardio'); // 未達 3 天門檻，建議休息
    });

    test('isPast 的日期 suggestion 為 past，且不影響未來模擬', () => {
      const result = generateMonthPlan({
        dateStrings: ['2026-08-15', '2026-08-16', '2026-08-17'],
        activeProgram: program,
        completedWorkouts: [],
        activeWorkoutToday: null,
        overridesByDate: new Map(),
        policyOverrides: undefined,
        restOverrideDays: 7,
        exerciseMap: exMap,
        today: new Date('2026-08-16').getTime(),
      });

      expect(result[0].dateStr).toBe('2026-08-15');
      expect(result[0].suggestion).toBe('past');

      expect(result[1].dateStr).toBe('2026-08-16'); // today
      expect(result[1].suggestion).toBe('train');

      expect(result[2].dateStr).toBe('2026-08-17'); // future
      expect(result[2].suggestion).toBe('train');
    });

    test('simCursor 大於 slots 長度時能正確 wrap', () => {
      const programWithCursor: TrainingProgram = {
        ...program,
        cursor: 4, // length = 3, so cursor 4 % 3 = 1 -> 肩/背
      };

      const result = generateMonthPlan({
        dateStrings: ['2026-08-16'],
        activeProgram: programWithCursor,
        completedWorkouts: [],
        activeWorkoutToday: null,
        overridesByDate: new Map(),
        policyOverrides: undefined,
        restOverrideDays: 7,
        exerciseMap: exMap,
        today: new Date('2026-08-16').getTime(),
      });

      expect(result[0].suggestedSlot?.label).toBe('背');
    });
  });

  describe('getValidDatesInRange', () => {
    const calendarDates = [
      null, '2026-08-14', '2026-08-15', '2026-08-16', '2026-08-17',
      '2026-08-18', '2026-08-19', '2026-08-20', '2026-08-21', null
    ];

    test('正確處理順向拖曳並包含首尾', () => {
      const result = getValidDatesInRange('2026-08-17', '2026-08-20', calendarDates, '2026-08-16');
      expect(result).toEqual(['2026-08-17', '2026-08-18', '2026-08-19', '2026-08-20']);
    });

    test('正確處理逆向拖曳並包含首尾', () => {
      const result = getValidDatesInRange('2026-08-20', '2026-08-17', calendarDates, '2026-08-16');
      expect(result).toEqual(['2026-08-17', '2026-08-18', '2026-08-19', '2026-08-20']);
    });

    test('自動排除已過去的日期', () => {
      const result = getValidDatesInRange('2026-08-14', '2026-08-18', calendarDates, '2026-08-16');
      expect(result).toEqual(['2026-08-16', '2026-08-17', '2026-08-18']);
    });

    test('自動排除留白格（null）', () => {
      const result = getValidDatesInRange('2026-08-14', '2026-08-21', calendarDates, '2026-08-16');
      expect(result).not.toContain(null);
      expect(result).toEqual(['2026-08-16', '2026-08-17', '2026-08-18', '2026-08-19', '2026-08-20', '2026-08-21']);
    });
  });
});
