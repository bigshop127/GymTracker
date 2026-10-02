import { describe, test, expect } from 'vitest';
import { buildLapHistory, diffLapEntry, hasLapChange, summarizeLapEntry } from '../lapHistory';
import { type SetLog, type Workout, type WorkoutEntry } from '../../db/schema';

function set(weight: number, reps: number, extra: Partial<SetLog> = {}): SetLog {
  return { id: crypto.randomUUID(), weight, reps, isWarmup: false, completed: true, createdAt: 0, ...extra };
}
function entry(exerciseId: string, order: number, sets: SetLog[]): WorkoutEntry {
  return { id: crypto.randomUUID(), exerciseId, order, sets };
}
function workout(id: string, day: number, entries: WorkoutEntry[], extra: Partial<Workout> = {}): Workout {
  return {
    id,
    title: '推 (Push)',
    startedAt: new Date(2026, 8, day, 18).getTime(),
    status: 'completed',
    entries,
    programId: 'p1',
    programSlotId: 'push',
    ...extra,
  };
}
const slot = { id: 'push', label: '推 (Push)' };

describe('summarizeLapEntry', () => {
  test('只看完成的正式組；暖身不算', () => {
    const s = summarizeLapEntry(entry('bench', 0, [
      set(20, 10, { isWarmup: true }),
      set(60, 8), set(60, 8), set(62.5, 6),
      set(62.5, 6, { completed: false }),
    ]));
    expect(s).toMatchObject({ sets: 3, minReps: 6, maxReps: 8, topWeight: 62.5 });
  });

  test('整個動作都沒打勾就退回看全部正式組', () => {
    expect(summarizeLapEntry(entry('bench', 0, [set(60, 8, { completed: false }), set(60, 8, { completed: false })])))
      .toMatchObject({ sets: 2, topWeight: 60 });
  });

  test('沒有正式組就沒有摘要', () => {
    expect(summarizeLapEntry(entry('bench', 0, [set(20, 10, { isWarmup: true })]))).toBeNull();
  });

  test('輔助動作記最少的輔助重量', () => {
    expect(summarizeLapEntry(entry('pullup', 0, [set(0, 8, { assistWeight: 20 }), set(0, 8, { assistWeight: 15 })])))
      .toMatchObject({ topWeight: 0, minAssist: 15 });
  });
});

describe('diffLapEntry', () => {
  const base = { exerciseId: 'bench', sets: 6, minReps: 8, maxReps: 8, topWeight: 60, minutes: 0 };

  test('重量、組數、次數有變都列出來', () => {
    expect(diffLapEntry(base, { ...base, sets: 5, minReps: 6, maxReps: 6, topWeight: 62.5 })).toEqual({
      isNew: false, weightDelta: 2.5, assistDelta: 0, sets: [6, 5], reps: ['8', '6'],
    });
  });

  test('完全一樣 → 沒有變化', () => {
    const diff = diffLapEntry(base, { ...base });
    expect(hasLapChange(diff)).toBe(false);
  });

  test('上一次沒做 → 新動作', () => {
    expect(diffLapEntry(undefined, base).isNew).toBe(true);
  });
});

describe('buildLapHistory', () => {
  test('新的在前，每一筆跟前一次比；最早那筆沒得比', () => {
    const records = buildLapHistory([
      workout('w5', 17, [entry('bench', 0, [set(57.5, 5), set(57.5, 5)]), entry('fly', 1, [set(30, 8)])], { programCycleNumber: 5 }),
      workout('w6', 24, [entry('bench', 0, [set(60, 5), set(60, 5)]), entry('press', 1, [set(18, 6)])], { programCycleNumber: 6 }),
    ], slot, 'p1');

    expect(records.map((r) => r.workout.id)).toEqual(['w6', 'w5']);
    expect(records[0].lap).toBe(6);
    expect(records[0].entries[0].diff?.weightDelta).toBe(2.5);
    expect(records[0].entries[1].diff?.isNew).toBe(true);
    expect(records[0].droppedExerciseIds).toEqual(['fly']);
    expect(records[1].entries.every((e) => e.diff === null)).toBe(true);
  });

  test('只收這一格的紀錄；別份計畫有記輪數、同分類的也收（標成前次計畫），刪掉的不收', () => {
    const records = buildLapHistory([
      workout('mine', 20, [entry('bench', 0, [set(60, 5)])], { programCycleNumber: 2 }),
      workout('old-run', 10, [entry('bench', 0, [set(55, 5)])], { programId: 'old', programSlotId: 'old-push', programCycleNumber: 7 }),
      workout('pull', 21, [entry('row', 0, [set(50, 10)])], { programSlotId: 'pull', title: '拉 (Pull)', programCycleNumber: 2 }),
      workout('template', 22, [entry('bench', 0, [set(60, 5)])], { programId: undefined, programSlotId: undefined }),
      workout('deleted', 23, [entry('bench', 0, [set(60, 5)])], { deletedAt: 1, programCycleNumber: 2 }),
    ], slot, 'p1');

    expect(records.map((r) => r.workout.id)).toEqual(['mine', 'old-run']);
    expect(records[1].fromOtherRun).toBe(true);
    expect(records[0].fromOtherRun).toBe(false);
  });
});
