import { describe, test, expect } from 'vitest';
import { revertSlotForDeletedWorkout } from '../programLifecycle';
import type { TrainingProgram, Workout } from '../../db/schema';

function makeProgram(overrides: Partial<TrainingProgram> = {}): TrainingProgram {
  return {
    id: 'p1',
    name: '宗諺',
    slots: [
      { id: 'pull', label: '拉' },
      { id: 'push', label: '推' },
      { id: 'leg', label: '腿' },
    ],
    completedSlotIdsThisLap: ['push', 'pull'],
    cycleCount: 0,
    estimatedWeeks: { min: 8, max: 8 },
    status: 'active',
    startedAt: 0,
    createdAt: 0,
    updatedAt: 0,
    ...overrides,
  };
}

function makeWorkout(overrides: Partial<Workout> = {}): Workout {
  return {
    id: 'w1',
    startedAt: 0,
    status: 'completed',
    entries: [],
    programId: 'p1',
    programSlotId: 'pull',
    programCycleNumber: 1,
    ...overrides,
  };
}

describe('revertSlotForDeletedWorkout', () => {
  test('刪掉這輪某一格的紀錄 → 那格退回沒練，其他格不動', () => {
    const result = revertSlotForDeletedWorkout(makeProgram(), makeWorkout(), [], 5);
    expect(result?.completedSlotIdsThisLap).toEqual(['push']);
    expect(result?.cycleCount).toBe(0);
    expect(result?.updatedAt).toBe(5);
  });

  test('沒掛課表、或是別份課表的紀錄 → 不動', () => {
    expect(revertSlotForDeletedWorkout(makeProgram(), makeWorkout({ programId: undefined, programSlotId: undefined }), [], 5)).toBeNull();
    expect(revertSlotForDeletedWorkout(makeProgram(), makeWorkout({ programId: 'old-run' }), [], 5)).toBeNull();
  });

  test('同一輪同一格還有別筆完成紀錄 → 不退', () => {
    const other = makeWorkout({ id: 'w2' });
    expect(revertSlotForDeletedWorkout(makeProgram(), makeWorkout(), [other], 5)).toBeNull();
    // 別筆被刪掉或屬於上一輪就不算
    expect(revertSlotForDeletedWorkout(makeProgram(), makeWorkout(), [{ ...other, deletedAt: 1 }], 5)).not.toBeNull();
  });

  test('刪的是跑滿上一輪的最後一格、新一輪還沒練 → 退回上一輪，只剩那格沒練', () => {
    const program = makeProgram({ cycleCount: 1, completedSlotIdsThisLap: [] });
    const result = revertSlotForDeletedWorkout(program, makeWorkout({ programSlotId: 'leg', programCycleNumber: 1 }), [], 5);
    expect(result?.cycleCount).toBe(0);
    expect(result?.completedSlotIdsThisLap).toEqual(['pull', 'push']);
  });

  test('新一輪已經開始練了才刪上一輪的紀錄 → 不去硬改', () => {
    const program = makeProgram({ cycleCount: 1, completedSlotIdsThisLap: ['pull'] });
    expect(revertSlotForDeletedWorkout(program, makeWorkout({ programSlotId: 'leg', programCycleNumber: 1 }), [], 5)).toBeNull();
  });

  test('那格本來就不在已練清單 → 不動', () => {
    expect(revertSlotForDeletedWorkout(makeProgram(), makeWorkout({ programSlotId: 'leg' }), [], 5)).toBeNull();
  });
});
