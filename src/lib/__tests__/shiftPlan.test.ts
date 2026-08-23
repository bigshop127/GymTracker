import { describe, test, expect } from 'vitest';
import {
  classifyShiftCode,
  generateMonthPlan,
  getCalendarDaysDiff,
  getValidDatesInRange,
  getWeekStart,
  classifyShiftCodeCategory,
  stripDecisionOverride,
  buildBaselineOverridesByDate,
  mergeBaselinePlan,
  describeSuggestionLabel,
} from '../shiftPlan';
import {
  type DayOverride,
  type TrainingProgram,
  type Workout,
  type Exercise,
  type ShiftPolicy
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
    test('輸入順序不同 [A, B, C] 與 [C, B, A] 應正規化為同一個 key', () => {
      const o1: DayOverride = { id: '2026-08-17', shiftLetters: ['A', 'B', 'C'], updatedAt: now };
      const o2: DayOverride = { id: '2026-08-17', shiftLetters: ['C', 'B', 'A'], updatedAt: now };
      expect(classifyShiftCode(o1, undefined)).toEqual(['rest']);
      expect(classifyShiftCode(o2, undefined)).toEqual(['rest']);
    });

    test('isDayOff 優先於 shiftLetters', () => {
      const o: DayOverride = { id: '2026-08-17', shiftLetters: ['A'], isDayOff: true, updatedAt: now };
      expect(classifyShiftCode(o, undefined)).toEqual(['train']);
    });

    test('查無代碼 fallback 到預設對照表', () => {
      const o: DayOverride = { id: '2026-08-17', shiftLetters: ['C'], updatedAt: now };
      expect(classifyShiftCode(o, undefined)).toEqual(['train']);
    });

    test('使用自訂 policyOverrides（可複選）', () => {
      const o: DayOverride = { id: '2026-08-17', shiftLetters: ['A'], updatedAt: now };
      const overrides: Record<string, ShiftPolicy[]> = { 'A': ['rest'] };
      expect(classifyShiftCode(o, overrides)).toEqual(['rest']);

      const multiOverrides: Record<string, ShiftPolicy[]> = { 'A': ['train', 'cardio'] };
      expect(classifyShiftCode(o, multiOverrides)).toEqual(['train', 'cardio']);
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
      completedSlotIdsThisLap: [],
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
        templatesById: new Map(),
      });

      expect(result).toHaveLength(2);
      expect(result[0].suggestion).toBe('noProgram');
      expect(result[1].suggestion).toBe('noProgram');
    });

    test('連續 ABC 班且班別有勾「安排訓練」：未達門檻為 restOnly，分類達門檻會強制 train 且 cursor 不漏跳', () => {
      // 假設 8/16（今天）是基準點。8/16 ~ 8/25 連續 10 天 ABC 班，班別政策勾了「安排訓練」+「休息」。
      // 門檻是 7 天，週目標設 0 讓平常的配額邏輯永遠不想練，只單獨看太久沒練規則會不會強制介入。
      // 課表只有 胸(推)/背(拉)/腿(腿) 三個分類；8/15 只練過推，拉、腿完全沒有歷史紀錄，
      // 三者幾乎同時到期，會連續觸發 3 天強制訓練把三個分類都補齊。
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
        overrides.set(dStr, { id: dStr, shiftLetters: ['A', 'B', 'C'], updatedAt: now });
      }

      // 我們希望模擬 8/16 ~ 8/25 的結果
      const result = generateMonthPlan({
        dateStrings: dates,
        activeProgram: program,
        completedWorkouts: [lastWorkout],
        activeWorkoutToday: null,
        overridesByDate: overrides,
        policyOverrides: { 'ABC': ['train', 'rest'] },
        restOverrideDays: 7,
        exerciseMap: exMap,
        today: new Date('2026-08-16').getTime(),
        weeklyTargetSessions: 0,
        templatesById: new Map(),
      });

      expect(result[1].dateStr).toBe('2026-08-17');
      expect(result[1].suggestion).toBe('restOnly');

      // 推最早到期（8/15 練過），8/22 應該是強制訓練胸 (index 6)
      expect(result[6].dateStr).toBe('2026-08-22');
      expect(result[6].suggestion).toBe('train');
      expect(result[6].suggestedSlot?.label).toBe('胸');

      // 拉、腿從未練過，緊接著也到期，8/23、8/24 會連續補訓練
      expect(result[7].dateStr).toBe('2026-08-23');
      expect(result[7].suggestion).toBe('train');

      expect(result[8].dateStr).toBe('2026-08-24');
      expect(result[8].suggestion).toBe('train');

      // 三個分類都補齊後，8/25 回到休息
      expect(result[9].dateStr).toBe('2026-08-25');
      expect(result[9].suggestion).toBe('restOnly');
    });

    test('連續 ABC 班且班別完全沒勾「安排訓練」（只勾休息）：不管多久沒練都不會被太久沒練規則推翻', () => {
      // 對應真實回報的問題：使用者把某班別明確設成只休息，太久沒練規則不該悄悄蓋過這個設定。
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
        overrides.set(dStr, { id: dStr, shiftLetters: ['A', 'B', 'C'], updatedAt: now });
      }

      const result = generateMonthPlan({
        dateStrings: dates,
        activeProgram: program,
        completedWorkouts: [lastWorkout],
        activeWorkoutToday: null,
        overridesByDate: overrides,
        policyOverrides: { 'ABC': ['rest'] }, // 明確只勾休息（不含「安排訓練」）
        restOverrideDays: 7,
        exerciseMap: exMap,
        today: new Date('2026-08-16').getTime(),
        templatesById: new Map(),
      });

      expect(result.every((d) => d.suggestion === 'restOnly')).toBe(true);
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
        templatesById: new Map(),
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
      overrides.set('2026-08-16', { id: '2026-08-16', shiftLetters: ['A', 'B', 'C'], updatedAt: now });
      overrides.set('2026-08-17', { id: '2026-08-17', shiftLetters: ['A', 'B', 'C'], updatedAt: now });

      // 情境一：最近一次重訓是 8/14，而 8/15 只有純有氧。
      // 計算 daysSinceWeights 是看 8/14，到今天 8/16 為 2 天，到明 8/17 為 3 天。
      // 設定門檻為 3，因此 8/17 的 AB 班應該被強制轉為 train。
      // 班別政策勾了「安排訓練」（太久沒練規則才有效）+ 週目標設 0（平常配額邏輯不會自己想練），
      // 讓這裡只單獨看太久沒練規則本身的天數計算對不對。
      const resultWithCardio = generateMonthPlan({
        dateStrings: ['2026-08-16', '2026-08-17'],
        activeProgram: program,
        completedWorkouts: [cardioWorkout, weightWorkoutOn14],
        activeWorkoutToday: null,
        overridesByDate: overrides,
        policyOverrides: { 'ABC': ['train', 'rest'] },
        restOverrideDays: 3,
        exerciseMap: exMap,
        today: new Date('2026-08-16').getTime(),
        weeklyTargetSessions: 0,
        templatesById: new Map(),
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
        policyOverrides: { 'ABC': ['train', 'rest'] },
        restOverrideDays: 3,
        exerciseMap: exMap,
        today: new Date('2026-08-16').getTime(),
        weeklyTargetSessions: 0,
        templatesById: new Map(),
      });

      expect(resultWithWeightOn15[1].dateStr).toBe('2026-08-17');
      expect(resultWithWeightOn15[1].suggestion).toBe('restOnly'); // 未達 3 天門檻，建議休息
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
        templatesById: new Map(),
      });

      expect(result[0].dateStr).toBe('2026-08-15');
      expect(result[0].suggestion).toBe('past');

      expect(result[1].dateStr).toBe('2026-08-16'); // today
      expect(result[1].suggestion).toBe('train');

      expect(result[2].dateStr).toBe('2026-08-17'); // future
      expect(result[2].suggestion).toBe('train');
    });

    test('completedSlotIdsThisLap 包含部分 slot 時能正確建議下一個', () => {
      const programWithCompleted: TrainingProgram = {
        ...program,
        completedSlotIdsThisLap: ['slot-胸'], // 胸已練過，下一個應建議背
        cycleCount: 1,
      };

      const result = generateMonthPlan({
        dateStrings: ['2026-08-16'],
        activeProgram: programWithCompleted,
        completedWorkouts: [],
        activeWorkoutToday: null,
        overridesByDate: new Map(),
        policyOverrides: undefined,
        restOverrideDays: 7,
        exerciseMap: exMap,
        today: new Date('2026-08-16').getTime(),
        templatesById: new Map(),
      });

      expect(result[0].suggestedSlot?.label).toBe('背');
    });

    test('completedSlotIdsThisLap 缺失（舊資料未遷移或被雲端同步覆蓋）不應該炸掉，視同本輪全新', () => {
      const programMissingField = {
        ...program,
        completedSlotIdsThisLap: undefined,
      } as unknown as TrainingProgram;

      expect(() => generateMonthPlan({
        dateStrings: ['2026-08-16'],
        activeProgram: programMissingField,
        completedWorkouts: [],
        activeWorkoutToday: null,
        overridesByDate: new Map(),
        policyOverrides: undefined,
        restOverrideDays: 7,
        exerciseMap: exMap,
        today: new Date('2026-08-16').getTime(),
        templatesById: new Map(),
      })).not.toThrow();
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

  describe('getWeekStart', () => {
    test('正確回推到當週週日', () => {
      expect(getWeekStart('2026-08-16')).toBe('2026-08-16'); // Sunday
      expect(getWeekStart('2026-08-17')).toBe('2026-08-16'); // Monday
      expect(getWeekStart('2026-08-22')).toBe('2026-08-16'); // Saturday
    });
  });

  describe('classifyShiftCodeCategory', () => {
    test('正確分類班別為類別', () => {
      expect(classifyShiftCodeCategory('A')).toBe('A');
      expect(classifyShiftCodeCategory('B')).toBe('B');
      expect(classifyShiftCodeCategory('C')).toBe('C');
      expect(classifyShiftCodeCategory('休假')).toBe('dayoff');
      expect(classifyShiftCodeCategory('今日無法')).toBe('unable');
      expect(classifyShiftCodeCategory('AB')).toBe('AB');
      expect(classifyShiftCodeCategory('ABC')).toBe('ABC');
    });
  });

  describe('generateMonthPlan weeklyTargetSessions & cushion', () => {
    const program: TrainingProgram = {
      id: 'prog-1',
      name: '測試計畫',
      slots: [
        { id: 'slot-胸', label: '胸' },
        { id: 'slot-背', label: '背' },
        { id: 'slot-腿', label: '腿' },
        { id: 'slot-肩', label: '肩' },
      ],
      completedSlotIdsThisLap: [],
      cycleCount: 0,
      estimatedWeeks: { min: 4, max: 8 },
      status: 'active',
      startedAt: now,
      createdAt: now,
      updatedAt: now,
    };

    test('無登記且無歷史記錄時，每週依目標次數排定訓練且週日起算', () => {
      const dates = [
        '2026-08-16', '2026-08-17', '2026-08-18', '2026-08-19',
        '2026-08-20', '2026-08-21', '2026-08-22'
      ];
      const result = generateMonthPlan({
        dateStrings: dates,
        activeProgram: program,
        completedWorkouts: [],
        activeWorkoutToday: null,
        overridesByDate: new Map(),
        policyOverrides: undefined,
        restOverrideDays: 7,
        exerciseMap: exMap,
        today: new Date('2026-08-16').getTime(),
        weeklyTargetSessions: 4,
        templatesById: new Map(),
      });

      expect(result[0].suggestion).toBe('train');
      expect(result[1].suggestion).toBe('train');
      expect(result[2].suggestion).toBe('train');
      expect(result[3].suggestion).toBe('restOrCardio'); // 4th consecutive day is blocked
      expect(result[4].suggestion).toBe('train'); // deferred 4th session
      expect(result[5].suggestion).toBe('restOrCardio');
      expect(result[6].suggestion).toBe('restOrCardio');
    });

    test('跨月月初墊底 cushion 邏輯：週日已練，新月週一起算應自動扣減', () => {
      const lastWorkout: Workout = {
        id: 'w-past',
        startedAt: new Date('2026-08-30T10:00:00').getTime(), // Sunday
        status: 'completed',
        entries: [{ id: 'e1', exerciseId: 'bench', order: 0, sets: [] }],
      };

      const dates = [
        '2026-09-01', '2026-09-02', '2026-09-03', '2026-09-04', '2026-09-05'
      ];

      const result = generateMonthPlan({
        dateStrings: dates,
        activeProgram: program,
        completedWorkouts: [lastWorkout],
        activeWorkoutToday: null,
        overridesByDate: new Map(),
        policyOverrides: undefined,
        restOverrideDays: 7,
        exerciseMap: exMap,
        today: new Date('2026-09-01').getTime(),
        weeklyTargetSessions: 4,
        templatesById: new Map(),
      });

      expect(result[0].dateStr).toBe('2026-09-01');
      expect(result[0].suggestion).toBe('train');
      expect(result[1].dateStr).toBe('2026-09-02');
      expect(result[1].suggestion).toBe('train');
      expect(result[2].dateStr).toBe('2026-09-03');
      expect(result[2].suggestion).toBe('train');
      expect(result[3].dateStr).toBe('2026-09-04');
      expect(result[3].suggestion).toBe('restOrCardio');
      expect(result[4].dateStr).toBe('2026-09-05');
      expect(result[4].suggestion).toBe('restOrCardio');
    });
  });

  describe('generateMonthPlan Phase 25 new rules', () => {
    const workoutTemplates = [
      { id: 'temp-pull', name: '拉 (Pull)', entries: [{ id: 'e1', exerciseId: 'bench', order: 0, sets: [] }], createdAt: now, updatedAt: now }, // chestBack
      { id: 'temp-push', name: '推 (Push)', entries: [{ id: 'e2', exerciseId: 'bench', order: 0, sets: [] }], createdAt: now, updatedAt: now }, // chestBack
      { id: 'temp-legs', name: '腿 (Legs)', entries: [{ id: 'e3', exerciseId: 'squat', order: 0, sets: [] }], createdAt: now, updatedAt: now }, // legs
      { id: 'temp-arms', name: '手 (Arms)', entries: [{ id: 'e4', exerciseId: 'run', order: 0, sets: [] }], createdAt: now, updatedAt: now }, // other
    ];
    const templatesMap = new Map(workoutTemplates.map(t => [t.id, t]));

    const program: TrainingProgram = {
      id: 'prog-2',
      name: '測試計畫2',
      slots: [
        { id: 'slot-pull', label: '拉', templateId: 'temp-pull' }, // chestBack
        { id: 'slot-push', label: '推', templateId: 'temp-push' }, // chestBack
        { id: 'slot-legs', label: '腿', templateId: 'temp-legs' }, // legs
        { id: 'slot-arms', label: '手', templateId: 'temp-arms' }, // other
      ],
      completedSlotIdsThisLap: [],
      cycleCount: 0,
      estimatedWeeks: { min: 4, max: 8 },
      status: 'active',
      startedAt: now,
      createdAt: now,
      updatedAt: now,
    };

    test('驗收 4：paused 或（已併入 paused 的舊資料）forcedRest 扣抵當週目標次數', () => {
      const dates = [
        '2026-08-16', '2026-08-17', '2026-08-18', '2026-08-19',
        '2026-08-20', '2026-08-21', '2026-08-22'
      ];
      const overrides = new Map<string, DayOverride>();
      // 週三 (8/19) 設定 forcedRest（舊欄位，仍需被視為 paused／今日無法處理）
      overrides.set('2026-08-19', { id: '2026-08-19', forcedRest: true, updatedAt: now });

      const result = generateMonthPlan({
        dateStrings: dates,
        activeProgram: program,
        completedWorkouts: [],
        activeWorkoutToday: null,
        overridesByDate: overrides,
        policyOverrides: undefined,
        restOverrideDays: 7,
        exerciseMap: exMap,
        today: new Date('2026-08-16').getTime(),
        weeklyTargetSessions: 4,
        templatesById: templatesMap,
      });

      // 原本目標 4，扣掉 1 天 forcedRest，實際目標應降為 3
      // 週日 (16): 拉 (chestBack) -> train (consecutive=1)
      // 週一 (17): 推 (chestBack) -> train (consecutive=2)
      // 週二 (18): 腿 (legs) -> 由於不急迫且非 chestBack，所以被 defer -> restOrCardio
      // 週三 (19): forcedRest -> 併入 paused
      // 週四 (20): 腿 (legs) -> remainingQuota = 3 - 2 = 1. daysLeftInWeek = 3 (Thu, Fri, Sat). Defer -> restOrCardio
      // 週五 (21): 腿 (legs) -> remainingQuota = 1. daysLeftInWeek = 2. Defer -> restOrCardio
      // 週六 (22): 腿 (legs) -> remainingQuota = 1. daysLeftInWeek = 1. Urgent -> train!
      const trainDays = result.filter(r => r.suggestion === 'train');
      expect(trainDays.length).toBe(3);
      expect(result[3].suggestion).toBe('paused');
    });

    test('驗收 5：腿日前後盡量安排休息/有氧', () => {
      const dates = [
        '2026-08-16'
      ];
      const programWithLegsCursor: TrainingProgram = {
        ...program,
        completedSlotIdsThisLap: ['slot-pull', 'slot-push'], // Leg day slot is next
      };
      const result = generateMonthPlan({
        dateStrings: dates,
        activeProgram: programWithLegsCursor,
        completedWorkouts: [],
        activeWorkoutToday: null,
        overridesByDate: new Map(),
        policyOverrides: undefined,
        restOverrideDays: 7,
        exerciseMap: exMap,
        today: new Date('2026-08-16').getTime(),
        weeklyTargetSessions: 3,
        templatesById: templatesMap,
      });

      // 週日 (16): 腿 (legs). 今天是腿日. 還有餘裕 -> defer -> cardio (因為 upcomingCategory 是 legs)
      expect(result[0].suggestion).toBe('cardio');
    });

    test('驗收 6：避免連續訓練 4 天以上', () => {
      const dates = [
        '2026-08-16', '2026-08-17', '2026-08-18', '2026-08-19',
        '2026-08-20', '2026-08-21', '2026-08-22'
      ];
      const chestBackProgram: TrainingProgram = {
        ...program,
        slots: [
          { id: 'slot-pull', label: '拉', templateId: 'temp-pull' },
          { id: 'slot-push', label: '推', templateId: 'temp-push' },
        ],
      };
      const result = generateMonthPlan({
        dateStrings: dates,
        activeProgram: chestBackProgram,
        completedWorkouts: [],
        activeWorkoutToday: null,
        overridesByDate: new Map(),
        policyOverrides: undefined,
        restOverrideDays: 7,
        exerciseMap: exMap,
        today: new Date('2026-08-16').getTime(),
        weeklyTargetSessions: 5,
        templatesById: templatesMap,
      });

      expect(result[0].suggestion).toBe('train');
      expect(result[1].suggestion).toBe('train');
      expect(result[2].suggestion).toBe('train');
      expect(result[3].suggestion).not.toBe('train'); // blocked by rule b
      expect(result[4].suggestion).toBe('train');
      expect(result[5].suggestion).toBe('train');
    });

    test('驗收 7：即使 urgent 每天都非練不可，第 4 天明確排班仍會被規則 b 推翻', () => {
      // 週三~週六（8/19~8/22），週目標 4、剩餘天數也剛好 4 天，
      // 每天 remainingQuota >= daysLeftInWeek 恆為 urgent，
      // 用來驗證：就算沒有分散休息的餘裕、天天都非練不可，規則 b 的連續三天硬上限依然是最終防線。
      const dates = [
        '2026-08-19', '2026-08-20', '2026-08-21', '2026-08-22'
      ];
      const overrides = new Map<string, DayOverride>();
      for (const d of dates) {
        overrides.set(d, { id: d, shiftLetters: ['A'], updatedAt: now });
      }

      const result = generateMonthPlan({
        dateStrings: dates,
        activeProgram: program,
        completedWorkouts: [],
        activeWorkoutToday: null,
        overridesByDate: overrides,
        policyOverrides: undefined,
        restOverrideDays: 7,
        exerciseMap: exMap,
        today: new Date('2026-08-19').getTime(),
        weeklyTargetSessions: 4,
        templatesById: templatesMap,
      });

      expect(result[0].suggestion).toBe('train');
      expect(result[1].suggestion).toBe('train');
      expect(result[2].suggestion).toBe('train');
      expect(result[3].suggestion).not.toBe('train'); // blocked by rule b
    });

    test('驗收 8：週目標餘裕用盡 (urgent) 時，即使是腿日仍建議 train', () => {
      const dates = [
        '2026-08-21', '2026-08-22' // Friday, Saturday
      ];
      const programWithLegsCursor: TrainingProgram = {
        ...program,
        completedSlotIdsThisLap: ['slot-pull', 'slot-push'], // Leg day slot is next
      };
      const result = generateMonthPlan({
        dateStrings: dates,
        activeProgram: programWithLegsCursor,
        completedWorkouts: [],
        activeWorkoutToday: null,
        overridesByDate: new Map(),
        policyOverrides: undefined,
        restOverrideDays: 7,
        exerciseMap: exMap,
        today: new Date('2026-08-21').getTime(),
        weeklyTargetSessions: 3,
        templatesById: templatesMap,
      });

      // Friday is urgent (target=3, trained=0, 2 days left: Fri/Sat)
      expect(result[0].dateStr).toBe('2026-08-21');
      expect(result[0].suggestion).toBe('train');
      expect(result[0].suggestedSlot?.label).toBe('腿');
    });
  });

  describe('Phase 26 指定部位與組合班預設政策新測試', () => {
    const workoutTemplates = [
      { id: 'temp-pull', name: '拉 (Pull)', entries: [{ id: 'e1', exerciseId: 'bench', order: 0, sets: [] }], createdAt: now, updatedAt: now },
      { id: 'temp-push', name: '推 (Push)', entries: [{ id: 'e2', exerciseId: 'bench', order: 0, sets: [] }], createdAt: now, updatedAt: now },
      { id: 'temp-legs', name: '腿 (Legs)', entries: [{ id: 'e3', exerciseId: 'squat', order: 0, sets: [] }], createdAt: now, updatedAt: now },
      { id: 'temp-arms', name: '手 (Arms)', entries: [{ id: 'e4', exerciseId: 'run', order: 0, sets: [] }], createdAt: now, updatedAt: now },
    ];
    const templatesMap = new Map(workoutTemplates.map(t => [t.id, t]));

    const program: TrainingProgram = {
      id: 'prog-26',
      name: '測試計畫26',
      slots: [
        { id: 'slot-pull', label: '拉', templateId: 'temp-pull' }, // chestBack
        { id: 'slot-push', label: '推', templateId: 'temp-push' }, // chestBack
        { id: 'slot-arms', label: '手', templateId: 'temp-arms' }, // other
        { id: 'slot-legs', label: '腿', templateId: 'temp-legs' }, // legs
      ],
      completedSlotIdsThisLap: [],
      cycleCount: 0,
      estimatedWeeks: { min: 4, max: 8 },
      status: 'active',
      startedAt: now,
      createdAt: now,
      updatedAt: now,
    };

    test('驗收 2：全新環境下 AC/BC 建議訓練，ABC 建議休息（各自獨立驗證，不牽扯連續天數分散邏輯）', () => {
      const recentWeightWorkout: Workout = {
        id: 'w-recent',
        startedAt: new Date('2026-08-15T10:00:00').getTime(),
        status: 'completed',
        entries: [{ id: 'e1', exerciseId: 'bench', order: 0, sets: [] }],
      };
      const runSingleDay = (shiftLetters: ('A' | 'B' | 'C')[]) => generateMonthPlan({
        dateStrings: ['2026-08-16'],
        activeProgram: program,
        // 昨天才練過推，避免「從沒練過分類」的墊底邏輯干擾這裡要驗證的班別政策本身
        completedWorkouts: [recentWeightWorkout],
        activeWorkoutToday: null,
        overridesByDate: new Map([['2026-08-16', { id: '2026-08-16', shiftLetters, updatedAt: now }]]),
        policyOverrides: undefined,
        restOverrideDays: 7,
        exerciseMap: exMap,
        today: new Date('2026-08-16').getTime(),
        weeklyTargetSessions: 4,
        templatesById: templatesMap,
      })[0];

      expect(runSingleDay(['A', 'C']).suggestion).toBe('train'); // AC -> train
      expect(runSingleDay(['B', 'C']).suggestion).toBe('train'); // BC -> train
      expect(runSingleDay(['A', 'B', 'C']).suggestion).toBe('restOnly'); // ABC -> restOnly（預設政策=休息）
    });

    test('班別政策指定「有氧」或「休息」時直接定案，不再用明天是不是腿日去猜', () => {
      const recentWeightWorkout: Workout = {
        id: 'w-recent',
        startedAt: new Date('2026-08-15T10:00:00').getTime(),
        status: 'completed',
        entries: [{ id: 'e1', exerciseId: 'bench', order: 0, sets: [] }],
      };
      // completedSlotIdsThisLap 讓明天輪到腿：如果沒有明確政策，舊邏輯會自動猜「有氧」
      const programWithLegsNext: TrainingProgram = {
        ...program,
        completedSlotIdsThisLap: ['slot-pull', 'slot-push'],
      };

      const runWithPolicy = (policy: 'cardio' | 'rest') => generateMonthPlan({
        dateStrings: ['2026-08-16'],
        activeProgram: programWithLegsNext,
        completedWorkouts: [recentWeightWorkout],
        activeWorkoutToday: null,
        overridesByDate: new Map([['2026-08-16', { id: '2026-08-16', shiftLetters: ['A', 'B', 'C'], updatedAt: now }]]),
        policyOverrides: { 'ABC': [policy] },
        restOverrideDays: 7,
        exerciseMap: exMap,
        today: new Date('2026-08-16').getTime(),
        weeklyTargetSessions: 4,
        templatesById: templatesMap,
      })[0];

      // 明天是腿日，若沒有明確政策舊邏輯會建議「有氧」；這裡兩個政策都要各自固定顯示，不能都變成有氧
      expect(runWithPolicy('cardio').suggestion).toBe('cardio');
      expect(runWithPolicy('rest').suggestion).toBe('restOnly');
    });

    test('班別政策複選：只勾「有氧」+「休息」（沒勾「安排訓練」）時直接照優先序挑有氧，不進訓練池', () => {
      const result = generateMonthPlan({
        dateStrings: ['2026-08-16'],
        activeProgram: program,
        completedWorkouts: [],
        activeWorkoutToday: null,
        overridesByDate: new Map([['2026-08-16', { id: '2026-08-16', shiftLetters: ['A', 'B', 'C'], updatedAt: now }]]),
        policyOverrides: { 'ABC': ['cardio', 'rest'] },
        restOverrideDays: 7,
        exerciseMap: exMap,
        today: new Date('2026-08-16').getTime(),
        weeklyTargetSessions: 4,
        templatesById: templatesMap,
      })[0];

      expect(result.suggestion).toBe('cardio');
      expect(result.suggestedSlot).toBeNull();
    });

    test('班別政策複選：勾「安排訓練」+「有氧」時，週目標已達成、輪不到練的那天改顯示有氧（不是舊版的自動猜測）', () => {
      const recentWeightWorkout: Workout = {
        id: 'w-recent',
        startedAt: new Date('2026-08-15T10:00:00').getTime(),
        status: 'completed',
        entries: [{ id: 'e1', exerciseId: 'bench', order: 0, sets: [] }],
      };

      const result = generateMonthPlan({
        dateStrings: ['2026-08-16'],
        activeProgram: program,
        completedWorkouts: [recentWeightWorkout],
        activeWorkoutToday: null,
        overridesByDate: new Map([['2026-08-16', { id: '2026-08-16', shiftLetters: ['A', 'B', 'C'], updatedAt: now }]]),
        policyOverrides: { 'ABC': ['train', 'cardio'] },
        restOverrideDays: 7,
        exerciseMap: exMap,
        today: new Date('2026-08-16').getTime(),
        weeklyTargetSessions: 0, // 週目標已達成（0 表示不用再練），逼進「今天不練」分支
        templatesById: templatesMap,
      })[0];

      expect(result.suggestion).toBe('cardio');
    });

    test('驗收 2-b：AB/AC/BC 連續好幾天都能練時，沒有 urgent 就隔天休息，訓練平均分散不擠成一坨', () => {
      const dates = ['2026-08-16', '2026-08-17', '2026-08-18', '2026-08-19', '2026-08-20'];
      const overrides = new Map<string, DayOverride>();
      for (const d of dates) {
        overrides.set(d, { id: d, shiftLetters: ['A', 'C'], updatedAt: now }); // 連續 5 天都是 AC 班
      }

      const result = generateMonthPlan({
        dateStrings: dates,
        activeProgram: program,
        completedWorkouts: [],
        activeWorkoutToday: null,
        overridesByDate: overrides,
        policyOverrides: undefined,
        restOverrideDays: 7,
        exerciseMap: exMap,
        today: new Date('2026-08-16').getTime(), // Sunday
        weeklyTargetSessions: 4,
        templatesById: templatesMap,
      });

      // 週目標 4、平日餘裕充足，應該隔天訓練：train, rest, train, rest, train
      expect(result[0].suggestion).toBe('train');
      expect(result[1].suggestion).not.toBe('train');
      expect(result[2].suggestion).toBe('train');
      expect(result[3].suggestion).not.toBe('train');
      expect(result[4].suggestion).toBe('train');
    });

    test('驗收 3：指定部位且不衝突時，建議該部位且從池子中排除', () => {
      const dates = ['2026-08-16', '2026-08-17', '2026-08-18'];
      const overrides = new Map<string, DayOverride>();
      overrides.set('2026-08-16', { id: '2026-08-16', pinnedSlotId: 'slot-legs', updatedAt: now });

      const result = generateMonthPlan({
        dateStrings: dates,
        activeProgram: program,
        completedWorkouts: [],
        activeWorkoutToday: null,
        overridesByDate: overrides,
        policyOverrides: undefined,
        restOverrideDays: 7,
        exerciseMap: exMap,
        today: new Date('2026-08-16').getTime(),
        weeklyTargetSessions: 7,
        templatesById: templatesMap,
      });

      expect(result[0].suggestion).toBe('train');
      expect(result[0].suggestedSlot?.id).toBe('slot-legs');
      expect(result[0].pinConflict).toBe(false);

      expect(result[1].suggestion).toBe('train');
      expect(result[1].suggestedSlot?.id).toBe('slot-pull');

      expect(result[2].suggestion).toBe('train');
      expect(result[2].suggestedSlot?.id).toBe('slot-push');
    });

    test('驗收 3-b：pinnedOutcome 指定休息／有氧時，即使週目標餘裕滿滿也直接定案，不進訓練池', () => {
      const dates = ['2026-08-16', '2026-08-17', '2026-08-18'];
      const overrides = new Map<string, DayOverride>();
      overrides.set('2026-08-16', { id: '2026-08-16', pinnedOutcome: 'rest', updatedAt: now });
      overrides.set('2026-08-17', { id: '2026-08-17', pinnedOutcome: 'cardio', updatedAt: now });

      const result = generateMonthPlan({
        dateStrings: dates,
        activeProgram: program,
        completedWorkouts: [],
        activeWorkoutToday: null,
        overridesByDate: overrides,
        policyOverrides: undefined,
        restOverrideDays: 7,
        exerciseMap: exMap,
        today: new Date('2026-08-16').getTime(),
        weeklyTargetSessions: 7, // 餘裕拉滿，證明是 pinnedOutcome 硬性定案而不是自然被建議休息
        templatesById: templatesMap,
      });

      expect(result[0].suggestion).toBe('restOrCardio');
      expect(result[0].suggestedSlot).toBeNull();

      expect(result[1].suggestion).toBe('cardio');
      expect(result[1].suggestedSlot).toBeNull();

      // 前兩天沒有消耗訓練池，第三天沒有 override 時應該拿池子裡第一個 slot（拉）
      expect(result[2].suggestion).toBe('train');
      expect(result[2].suggestedSlot?.id).toBe('slot-pull');
    });

    test('驗收 4：指定部位已在之前被消耗，則 pinConflict 為 true 且退回一般建議', () => {
      const dates = ['2026-08-16', '2026-08-17'];
      const overrides = new Map<string, DayOverride>();
      overrides.set('2026-08-17', { id: '2026-08-17', pinnedSlotId: 'slot-pull', updatedAt: now });

      const result = generateMonthPlan({
        dateStrings: dates,
        activeProgram: program,
        completedWorkouts: [],
        activeWorkoutToday: null,
        overridesByDate: overrides,
        policyOverrides: undefined,
        restOverrideDays: 7,
        exerciseMap: exMap,
        today: new Date('2026-08-16').getTime(),
        weeklyTargetSessions: 7,
        templatesById: templatesMap,
      });

      expect(result[0].suggestedSlot?.id).toBe('slot-pull');
      expect(result[1].pinConflict).toBe(true);
      expect(result[1].suggestion).toBe('train');
      expect(result[1].suggestedSlot?.id).toBe('slot-push');
    });

    test('驗收 5：連續訓練天數達上限時，指定部位仍會被推翻且 pinConflict 為 true', () => {
      const dates = ['2026-08-16', '2026-08-17', '2026-08-18', '2026-08-19'];
      const overrides = new Map<string, DayOverride>();
      overrides.set('2026-08-19', { id: '2026-08-19', pinnedSlotId: 'slot-arms', updatedAt: now });

      const program3: TrainingProgram = {
        ...program,
        slots: [
          { id: 'slot-pull', label: '拉', templateId: 'temp-pull' },
          { id: 'slot-push', label: '推', templateId: 'temp-push' },
        ],
      };

      const result = generateMonthPlan({
        dateStrings: dates,
        activeProgram: program3,
        completedWorkouts: [],
        activeWorkoutToday: null,
        overridesByDate: overrides,
        policyOverrides: undefined,
        restOverrideDays: 7,
        exerciseMap: exMap,
        today: new Date('2026-08-16').getTime(),
        weeklyTargetSessions: 5,
        templatesById: templatesMap,
      });

      expect(result[0].suggestion).toBe('train');
      expect(result[1].suggestion).toBe('train');
      expect(result[2].suggestion).toBe('train');
      expect(result[3].suggestion).not.toBe('train'); // blocked by rule b
      expect(result[3].pinConflict).toBe(true);
    });
  });

  describe('Phase 27 原定計畫 vs 實際計畫', () => {
    const workoutTemplates = [
      { id: 'temp-pull', name: '拉 (Pull)', entries: [{ id: 'e1', exerciseId: 'bench', order: 0, sets: [] }], createdAt: now, updatedAt: now },
      { id: 'temp-push', name: '推 (Push)', entries: [{ id: 'e2', exerciseId: 'bench', order: 0, sets: [] }], createdAt: now, updatedAt: now },
      { id: 'temp-legs', name: '腿 (Legs)', entries: [{ id: 'e3', exerciseId: 'squat', order: 0, sets: [] }], createdAt: now, updatedAt: now },
      { id: 'temp-arms', name: '手 (Arms)', entries: [{ id: 'e4', exerciseId: 'run', order: 0, sets: [] }], createdAt: now, updatedAt: now },
    ];
    const templatesMap = new Map(workoutTemplates.map(t => [t.id, t]));

    const program: TrainingProgram = {
      id: 'prog-27',
      name: '測試計畫27',
      slots: [
        { id: 'slot-pull', label: '拉', templateId: 'temp-pull' }, // chestBack
        { id: 'slot-push', label: '推', templateId: 'temp-push' }, // chestBack
        { id: 'slot-arms', label: '手', templateId: 'temp-arms' }, // other
        { id: 'slot-legs', label: '腿', templateId: 'temp-legs' }, // legs
      ],
      completedSlotIdsThisLap: [],
      cycleCount: 0,
      estimatedWeeks: { min: 4, max: 8 },
      status: 'active',
      startedAt: now,
      createdAt: now,
      updatedAt: now,
    };

    test('1. stripDecisionOverride / buildBaselineOverridesByDate：同時有 shiftLetters 跟 pinnedOutcome/paused 的 DayOverride，驗證決策覆寫欄位被清空但客觀事實保留', () => {
      const o: DayOverride = {
        id: '2026-08-20',
        shiftLetters: ['A'],
        isDayOff: false,
        paused: true,
        forcedRest: true,
        pinnedSlotId: 'slot-pull',
        pinnedOutcome: 'rest',
        updatedAt: now
      };
      
      const stripped = stripDecisionOverride(o);
      expect(stripped.shiftLetters).toEqual(['A']);
      expect(stripped.isDayOff).toBe(false);
      expect(stripped.paused).toBeUndefined();
      expect(stripped.forcedRest).toBeUndefined();
      expect(stripped.pinnedSlotId).toBeUndefined();
      expect(stripped.pinnedOutcome).toBeUndefined();

      const overrides = new Map<string, DayOverride>();
      overrides.set('2026-08-20', o);
      const baselineOverrides = buildBaselineOverridesByDate(overrides);
      const bO = baselineOverrides.get('2026-08-20')!;
      expect(bO.shiftLetters).toEqual(['A']);
      expect(bO.paused).toBeUndefined();
    });

    test('2. mergeBaselinePlan / 重新生成計畫：驗證 diverged 為 true，且當天之後因節奏不同指向不同 Slot', () => {
      const dates = ['2026-08-20', '2026-08-21', '2026-08-22'];
      const overrides = new Map<string, DayOverride>();
      // 8/20 原定應該是拉（因為池子裡第一個是拉，且是 chestBack 又是工作日），但實際被蓋成 rest
      overrides.set('2026-08-20', { id: '2026-08-20', pinnedOutcome: 'rest', updatedAt: now });

      const actualPlan = generateMonthPlan({
        dateStrings: dates,
        activeProgram: program,
        completedWorkouts: [],
        activeWorkoutToday: null,
        overridesByDate: overrides,
        policyOverrides: undefined,
        restOverrideDays: 7,
        exerciseMap: exMap,
        today: new Date('2026-08-20').getTime(),
        weeklyTargetSessions: 4,
        templatesById: templatesMap,
      });

      const baselineOverrides = buildBaselineOverridesByDate(overrides);
      const baselinePlan = generateMonthPlan({
        dateStrings: dates,
        activeProgram: program,
        completedWorkouts: [],
        activeWorkoutToday: null,
        overridesByDate: baselineOverrides,
        policyOverrides: undefined,
        restOverrideDays: 7,
        exerciseMap: exMap,
        today: new Date('2026-08-20').getTime(),
        weeklyTargetSessions: 4,
        templatesById: templatesMap,
      });

      const merged = mergeBaselinePlan(actualPlan, baselinePlan);
      expect(merged).toHaveLength(3);

      // 8/20: 實際建議為 restOrCardio，原定建議為 train (pull)
      expect(merged[0].dateStr).toBe('2026-08-20');
      expect(merged[0].diverged).toBe(true);
      expect(merged[0].suggestion).toBe('restOrCardio');
      expect(merged[0].baselineSuggestion).toBe('train');
      expect(merged[0].baselineSuggestedSlot?.id).toBe('slot-pull');

      // 8/21: 原定因為 8/20 練了 pull，所以 8/21 應該會是推/休息/有氧等等（根據演算法節奏）；實際因為 8/20 沒練，所以會往後遞延在 8/21 建議練 pull
      // 實際 8/21 應該練 pull
      expect(merged[1].dateStr).toBe('2026-08-21');
      expect(merged[1].suggestedSlot?.id).toBe('slot-pull');
      // 原定 8/21 應該建議練 push（因為 pull 在 8/20 被消耗了）
      expect(merged[1].baselineSuggestedSlot?.id).toBe('slot-push');
      expect(merged[1].diverged).toBe(true);
    });

    test('3. 過去日期：驗證 diverged 為 false 即使有 override', () => {
      const dates = ['2026-08-19']; // today is 2026-08-20
      const overrides = new Map<string, DayOverride>();
      overrides.set('2026-08-19', { id: '2026-08-19', pinnedOutcome: 'rest', updatedAt: now });

      const actualPlan = generateMonthPlan({
        dateStrings: dates,
        activeProgram: program,
        completedWorkouts: [],
        activeWorkoutToday: null,
        overridesByDate: overrides,
        policyOverrides: undefined,
        restOverrideDays: 7,
        exerciseMap: exMap,
        today: new Date('2026-08-20').getTime(),
        weeklyTargetSessions: 4,
        templatesById: templatesMap,
      });

      const baselineOverrides = buildBaselineOverridesByDate(overrides);
      const baselinePlan = generateMonthPlan({
        dateStrings: dates,
        activeProgram: program,
        completedWorkouts: [],
        activeWorkoutToday: null,
        overridesByDate: baselineOverrides,
        policyOverrides: undefined,
        restOverrideDays: 7,
        exerciseMap: exMap,
        today: new Date('2026-08-20').getTime(),
        weeklyTargetSessions: 4,
        templatesById: templatesMap,
      });

      const merged = mergeBaselinePlan(actualPlan, baselinePlan);
      expect(merged).toHaveLength(1);
      expect(merged[0].diverged).toBe(false);
    });

    test('4. describeSuggestionLabel 中文文案斷言', () => {
      const mockSlot = { id: 'slot-1', label: '自訂胸' };
      expect(describeSuggestionLabel('train', mockSlot)).toBe('自訂胸');
      expect(describeSuggestionLabel('train', null)).toBe('訓練');
      expect(describeSuggestionLabel('restOrCardio', null)).toBe('休息/有氧');
      expect(describeSuggestionLabel('cardio', null)).toBe('建議有氧');
      expect(describeSuggestionLabel('paused', null)).toBe('今日無法');
      expect(describeSuggestionLabel('programPaused', null)).toBe('計畫暫停中');
      expect(describeSuggestionLabel('noProgram', null)).toBe('尚未設定課表');
      expect(describeSuggestionLabel('past', null)).toBe('—');
    });
  });

  describe('Phase 28 programPaused：整份計畫暫停', () => {
    const workoutTemplates = [
      { id: 'temp-pull', name: '拉 (Pull)', entries: [{ id: 'e1', exerciseId: 'bench', order: 0, sets: [] }], createdAt: now, updatedAt: now },
      { id: 'temp-push', name: '推 (Push)', entries: [{ id: 'e2', exerciseId: 'bench', order: 0, sets: [] }], createdAt: now, updatedAt: now },
    ];
    const templatesMap = new Map(workoutTemplates.map(t => [t.id, t]));

    const program: TrainingProgram = {
      id: 'prog-28',
      name: '測試計畫28',
      slots: [
        { id: 'slot-pull', label: '拉', templateId: 'temp-pull' },
        { id: 'slot-push', label: '推', templateId: 'temp-push' },
      ],
      completedSlotIdsThisLap: [],
      cycleCount: 0,
      estimatedWeeks: { min: 4, max: 8 },
      status: 'paused',
      startedAt: now,
      createdAt: now,
      updatedAt: now,
    };

    test('programPaused: true → 未來日期全部 programPaused，過去日期仍是 past', () => {
      const dates = ['2026-08-15', '2026-08-16', '2026-08-17', '2026-08-18'];
      const result = generateMonthPlan({
        dateStrings: dates,
        activeProgram: null, // 暫停時 store 的 activeProgram 是 null
        completedWorkouts: [],
        activeWorkoutToday: null,
        overridesByDate: new Map(),
        policyOverrides: undefined,
        restOverrideDays: 7,
        exerciseMap: exMap,
        today: new Date('2026-08-16').getTime(),
        templatesById: templatesMap,
        programPaused: true,
      });

      expect(result[0].dateStr).toBe('2026-08-15');
      expect(result[0].suggestion).toBe('past');
      expect(result[1].suggestion).toBe('programPaused');
      expect(result[2].suggestion).toBe('programPaused');
      expect(result[3].suggestion).toBe('programPaused');
    });

    test('programPaused: true 時，帶 pinnedSlotId 的那天不會產生 pinConflict（根本沒進排課分支）', () => {
      const overrides = new Map<string, DayOverride>();
      overrides.set('2026-08-16', { id: '2026-08-16', pinnedSlotId: 'slot-pull', updatedAt: now });

      const result = generateMonthPlan({
        dateStrings: ['2026-08-16'],
        activeProgram: null,
        completedWorkouts: [],
        activeWorkoutToday: null,
        overridesByDate: overrides,
        policyOverrides: undefined,
        restOverrideDays: 7,
        exerciseMap: exMap,
        today: new Date('2026-08-16').getTime(),
        templatesById: templatesMap,
        programPaused: true,
      });

      expect(result[0].suggestion).toBe('programPaused');
      expect(result[0].pinConflict).toBe(false);
      expect(result[0].suggestedSlot).toBeNull();
    });

    test('「原定 vs 實際」兩邊都 paused → diverged 全為 false', () => {
      const dates = ['2026-08-16', '2026-08-17'];
      const overrides = new Map<string, DayOverride>();
      overrides.set('2026-08-16', { id: '2026-08-16', pinnedSlotId: 'slot-pull', updatedAt: now });

      const actualPlan = generateMonthPlan({
        dateStrings: dates,
        activeProgram: null,
        completedWorkouts: [],
        activeWorkoutToday: null,
        overridesByDate: overrides,
        policyOverrides: undefined,
        restOverrideDays: 7,
        exerciseMap: exMap,
        today: new Date('2026-08-16').getTime(),
        templatesById: templatesMap,
        programPaused: true,
      });

      const baselineOverrides = buildBaselineOverridesByDate(overrides);
      const baselinePlan = generateMonthPlan({
        dateStrings: dates,
        activeProgram: null,
        completedWorkouts: [],
        activeWorkoutToday: null,
        overridesByDate: baselineOverrides,
        policyOverrides: undefined,
        restOverrideDays: 7,
        exerciseMap: exMap,
        today: new Date('2026-08-16').getTime(),
        templatesById: templatesMap,
        programPaused: true,
      });

      const merged = mergeBaselinePlan(actualPlan, baselinePlan);
      expect(merged.every((d) => d.diverged === false)).toBe(true);
    });

    test('programPaused: false（或不傳）→ 既有測試結果一字不變（回歸保護）', () => {
      const activeProgram: TrainingProgram = { ...program, status: 'active' };
      const withFalse = generateMonthPlan({
        dateStrings: ['2026-08-16', '2026-08-17'],
        activeProgram,
        completedWorkouts: [],
        activeWorkoutToday: null,
        overridesByDate: new Map(),
        policyOverrides: undefined,
        restOverrideDays: 7,
        exerciseMap: exMap,
        today: new Date('2026-08-16').getTime(),
        templatesById: templatesMap,
        programPaused: false,
      });
      const withoutField = generateMonthPlan({
        dateStrings: ['2026-08-16', '2026-08-17'],
        activeProgram,
        completedWorkouts: [],
        activeWorkoutToday: null,
        overridesByDate: new Map(),
        policyOverrides: undefined,
        restOverrideDays: 7,
        exerciseMap: exMap,
        today: new Date('2026-08-16').getTime(),
        templatesById: templatesMap,
      });

      expect(withFalse.map(d => d.suggestion)).toEqual(withoutField.map(d => d.suggestion));
      expect(withFalse[0].suggestion).toBe('train');
    });
  });
});
