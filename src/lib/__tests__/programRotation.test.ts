import { describe, test, expect } from 'vitest';
import { migrateProgramToPushPullArms, rotationSlotsOf, settleLap, toPushPullArmsRotation } from '../programRotation';
import { revertSlotForDeletedWorkout, getProgramWeekNumber } from '../programLifecycle';
import { weekIdxForCycle } from '../programWeeks';
import { ZONGYUAN_PROGRAM_NAME } from '../../data/zongyuan-8week-program';
import { type TrainingProgram, type Workout } from '../../db/schema';

const DAY = 24 * 60 * 60 * 1000;

function makeProgram(overrides: Partial<TrainingProgram> = {}): TrainingProgram {
  return {
    id: 'p1',
    name: ZONGYUAN_PROGRAM_NAME,
    slots: [
      { id: 'push', label: '推 (Push)' },
      { id: 'pull', label: '拉 (Pull)' },
      { id: 'arms', label: '手 (Arms)' },
      { id: 'legs', label: '腿 (Leg)', selfScheduled: true },
    ],
    completedSlotIdsThisLap: [],
    cycleCount: 0,
    estimatedWeeks: { min: 8, max: 8 },
    status: 'active',
    startedAt: 1000,
    createdAt: 1000,
    updatedAt: 1000,
    ...overrides,
  };
}

describe('rotationSlotsOf / settleLap', () => {
  test('自行安排的格子不在輪替裡', () => {
    expect(rotationSlotsOf(makeProgram()).map((s) => s.id)).toEqual(['push', 'pull', 'arms']);
  });

  test('推拉手都練完就進下一輪，腿練沒練都一樣', () => {
    expect(settleLap(makeProgram({ completedSlotIdsThisLap: ['push', 'pull', 'arms'], cycleCount: 4 })))
      .toEqual({ completedSlotIdsThisLap: [], cycleCount: 5 });
    expect(settleLap(makeProgram({ completedSlotIdsThisLap: ['push', 'legs'], cycleCount: 4 })))
      .toEqual({ completedSlotIdsThisLap: ['push'], cycleCount: 4 });
  });

  test('重複的 id、已經不存在的格子都清掉', () => {
    expect(settleLap(makeProgram({ completedSlotIdsThisLap: ['push', 'push', 'gone'] })))
      .toEqual({ completedSlotIdsThisLap: ['push'], cycleCount: 0 });
  });

  test('全部都自行安排：永遠不會自己進下一輪', () => {
    const p = makeProgram({ slots: [{ id: 'legs', label: '腿', selfScheduled: true }], completedSlotIdsThisLap: ['legs'] });
    expect(settleLap(p)).toEqual({ completedSlotIdsThisLap: [], cycleCount: 0 });
  });
});

describe('toPushPullArmsRotation', () => {
  test('拉/推/腿/手 → 推、拉、手、腿(自行安排)，其他欄位保留', () => {
    const result = toPushPullArmsRotation([
      { id: 'a', label: '拉 (Pull)', templateId: 't1' },
      { id: 'b', label: '推 (Push)', templateId: 't2' },
      { id: 'c', label: '腿 (Leg)', templateId: 't3' },
      { id: 'd', label: '手 (Arms)', templateId: 't4' },
    ]);
    expect(result?.map((s) => [s.id, s.templateId, !!s.selfScheduled])).toEqual([
      ['b', 't2', false],
      ['a', 't1', false],
      ['d', 't4', false],
      ['c', 't3', true],
    ]);
  });

  test('不是推拉腿手四格的課表不動', () => {
    expect(toPushPullArmsRotation([{ label: '胸日' }, { label: '背日' }, { label: '腿臀日' }])).toBeNull();
  });
});

describe('migrateProgramToPushPullArms', () => {
  const legacy = makeProgram({
    slots: [
      { id: 'pull', label: '拉 (Pull)' },
      { id: 'push', label: '推 (Push)' },
      { id: 'legs', label: '腿 (Leg)' },
      { id: 'arms', label: '手 (Arms)' },
    ],
  });

  test('目前的宗諺課表會被調整', () => {
    const migrated = migrateProgramToPushPullArms(legacy, 5000);
    expect(migrated?.slots.map((s) => s.id)).toEqual(['push', 'pull', 'arms', 'legs']);
    expect(migrated?.updatedAt).toBe(5000);
  });

  test('已經調過（任一格設過 selfScheduled，包含使用者自己關掉的 false）就不動', () => {
    expect(migrateProgramToPushPullArms(makeProgram(), 5000)).toBeNull();
    const userToggledOff = { ...legacy, slots: legacy.slots.map((s) => ({ ...s, selfScheduled: false })) };
    expect(migrateProgramToPushPullArms(userToggledOff, 5000)).toBeNull();
  });

  test('封存的、刪掉的、別的名字的都不動', () => {
    expect(migrateProgramToPushPullArms({ ...legacy, status: 'completed' }, 5000)).toBeNull();
    expect(migrateProgramToPushPullArms({ ...legacy, deletedAt: 10 }, 5000)).toBeNull();
    expect(migrateProgramToPushPullArms({ ...legacy, name: '別的計畫' }, 5000)).toBeNull();
  });
});

describe('weekIdxForCycle：第 1~8 輪對 W1~W8，第 9 輪起固定 W7', () => {
  test.each([
    [1, 0], [4, 3], [8, 7], [9, 6], [10, 6], [37, 6], [0, 0],
  ])('第 %i 輪 → index %i', (cycle, idx) => {
    expect(weekIdxForCycle(cycle)).toBe(idx);
  });
});

describe('getProgramWeekNumber：開始後第幾週', () => {
  test('開始當天是第 1 週，滿 7 天是第 2 週，暫停期間不算', () => {
    const p = makeProgram({ startedAt: 0 });
    expect(getProgramWeekNumber(p, 0)).toBe(1);
    expect(getProgramWeekNumber(p, 6 * DAY)).toBe(1);
    expect(getProgramWeekNumber(p, 7 * DAY)).toBe(2);
    expect(getProgramWeekNumber({ ...p, accumulatedPausedMs: 7 * DAY }, 13 * DAY)).toBe(1);
  });
});

describe('revertSlotForDeletedWorkout：自行安排的格子', () => {
  test('刪掉腿日的紀錄不會動到輪替進度', () => {
    const p = makeProgram({ completedSlotIdsThisLap: ['push'] });
    const deleted: Workout = {
      id: 'w1', startedAt: 0, status: 'completed', entries: [],
      programId: 'p1', programSlotId: 'legs', programCycleNumber: 1,
    };
    expect(revertSlotForDeletedWorkout(p, deleted, [], 10)).toBeNull();
  });

  test('退回上一輪時，已練清單只放輪替格子（不放腿）', () => {
    const p = makeProgram({ completedSlotIdsThisLap: [], cycleCount: 1 });
    const deleted: Workout = {
      id: 'w1', startedAt: 0, status: 'completed', entries: [],
      programId: 'p1', programSlotId: 'arms', programCycleNumber: 1,
    };
    const reverted = revertSlotForDeletedWorkout(p, deleted, [], 10);
    expect(reverted?.cycleCount).toBe(0);
    expect(reverted?.completedSlotIdsThisLap).toEqual(['push', 'pull']);
  });
});
