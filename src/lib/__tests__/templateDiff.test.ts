import { describe, test, expect } from 'vitest';
import { diffWorkoutAgainstTemplate, mergeWorkoutIntoTemplate, summarizeSets } from '../templateDiff';
import type { SetLog, Workout, WorkoutEntry, WorkoutTemplate } from '../../db/schema';

function set(weight: number, reps: number, extra: Partial<SetLog> = {}): SetLog {
  return { id: crypto.randomUUID(), weight, reps, isWarmup: false, completed: true, createdAt: 0, ...extra };
}
function entry(id: string, exerciseId: string, order: number, sets: SetLog[], extra: Partial<WorkoutEntry> = {}): WorkoutEntry {
  return { id, exerciseId, order, sets, ...extra };
}
function template(entries: WorkoutEntry[]): WorkoutTemplate {
  return { id: 't1', name: '拉 (Pull)', category: '拉', entries, createdAt: 1, updatedAt: 1 };
}
function workout(entries: WorkoutEntry[]): Workout {
  return { id: 'w1', startedAt: 0, status: 'active', location: '楊梅WG', entries };
}

const tpl = template([
  entry('t-a', 'pulldown', 0, [set(25, 12), set(25, 12), set(25, 12)], { candidateExerciseIds: ['pulldown', 'pullup'] }),
  entry('t-b', 'row', 1, [set(40, 10), set(40, 10)]),
  entry('t-c', 'facepull', 2, [set(10, 15)]),
]);

describe('diffWorkoutAgainstTemplate', () => {
  test('完全照範本做 → 沒有差異', () => {
    const w = workout([
      entry('a', 'pulldown', 0, [set(25, 12), set(25, 12), set(25, 12)], { candidateExerciseIds: ['pulldown', 'pullup'] }),
      entry('b', 'row', 1, [set(40, 10), set(40, 10)]),
      entry('c', 'facepull', 2, [set(10, 15)]),
    ]);
    expect(diffWorkoutAgainstTemplate(tpl, w)).toEqual([]);
  });

  test('加組、換重量、新增動作、少做一個動作都列出來', () => {
    const w = workout([
      entry('a', 'pulldown', 0, [set(27.5, 12), set(27.5, 12), set(27.5, 12), set(27.5, 10)]),
      entry('b', 'row', 1, [set(40, 10), set(40, 10)]),
      entry('d', 'curl', 2, [set(12, 12)]),
    ]);
    const changes = diffWorkoutAgainstTemplate(tpl, w);
    expect(changes).toEqual([
      expect.objectContaining({ kind: 'changed', exerciseId: 'pulldown', weeklyLocked: false }),
      { kind: 'added', exerciseId: 'curl' },
      { kind: 'removed', exerciseId: 'facepull' },
    ]);
    const changed = changes[0] as Extract<(typeof changes)[number], { kind: 'changed' }>;
    expect(changed.before).toMatchObject({ sets: 3, topWeight: 25, minReps: 12, maxReps: 12 });
    expect(changed.after).toMatchObject({ sets: 4, topWeight: 27.5, minReps: 10, maxReps: 12 });
  });

  test('今天改做範本裡的替代動作 → 標出從哪個換過來；範本沒存過它的數字時 before 為空', () => {
    const w = workout([
      entry('a', 'pullup', 0, [set(0, 8)], { candidateExerciseIds: ['pulldown', 'pullup'] }),
      entry('b', 'row', 1, [set(40, 10), set(40, 10)]),
      entry('c', 'facepull', 2, [set(10, 15)]),
    ]);
    const [change] = diffWorkoutAgainstTemplate(tpl, w);
    expect(change).toMatchObject({ kind: 'changed', exerciseId: 'pullup', swappedFromExerciseId: 'pulldown', before: undefined });
  });

  test('只有順序不同 → reordered', () => {
    const w = workout([
      entry('b', 'row', 0, [set(40, 10), set(40, 10)]),
      entry('a', 'pulldown', 1, [set(25, 12), set(25, 12), set(25, 12)]),
      entry('c', 'facepull', 2, [set(10, 15)]),
    ]);
    expect(diffWorkoutAgainstTemplate(tpl, w)).toEqual([{ kind: 'reordered' }]);
  });

  test('有週次目標的動作：組數次數照當週目標比、只有重量變才算差異', () => {
    const weekly = template([
      entry('t-a', 'pulldown', 0, [set(25, 12)], { weeklyTargets: [{ sets: 4, reps: 12 }, { sets: 5, reps: 10 }] }),
    ]);
    const sameWeight = workout([entry('a', 'pulldown', 0, [set(25, 10), set(25, 10), set(25, 10)])]);
    expect(diffWorkoutAgainstTemplate(weekly, sameWeight, 2)).toEqual([]);

    const heavier = workout([entry('a', 'pulldown', 0, [set(30, 10), set(30, 10), set(30, 10), set(30, 10), set(30, 10)])]);
    const [change] = diffWorkoutAgainstTemplate(weekly, heavier, 2);
    expect(change).toMatchObject({ kind: 'changed', weeklyLocked: true, before: { sets: 5, minReps: 10, topWeight: 25 } });
  });
});

describe('mergeWorkoutIntoTemplate', () => {
  test('動作、順序、組數重量換成這次的；範本 id/名稱/分類保留；對應到的動作保留 entry id 與週次目標', () => {
    const weeklyTargets = [{ sets: 4, reps: 12 }];
    const base = template([
      entry('t-a', 'pulldown', 0, [set(25, 12)], { candidateExerciseIds: ['pulldown', 'pullup'], weeklyTargets }),
      entry('t-b', 'row', 1, [set(40, 10)]),
    ]);
    const w = workout([
      entry('x', 'curl', 0, [set(12, 12)]),
      entry('y', 'pullup', 1, [set(0, 8, { rpe: 9 })], {
        candidateExerciseIds: ['pulldown', 'pullup'],
        candidateSets: [{ exerciseId: 'pulldown', sets: [set(27.5, 12)] }],
      }),
    ]);
    const merged = mergeWorkoutIntoTemplate(base, w, 999);

    expect(merged).toMatchObject({ id: 't1', name: '拉 (Pull)', category: '拉', createdAt: 1, updatedAt: 999, location: '楊梅WG' });
    expect(merged.entries.map((e) => e.exerciseId)).toEqual(['curl', 'pullup']);
    expect(merged.entries.map((e) => e.order)).toEqual([0, 1]);

    const pull = merged.entries[1];
    expect(pull.id).toBe('t-a');
    expect(pull.weeklyTargets).toEqual(weeklyTargets);
    expect(pull.sets[0]).toMatchObject({ weight: 0, reps: 8, completed: false });
    expect(pull.sets[0].rpe).toBeUndefined();
    expect(pull.candidateSets![0]).toMatchObject({ exerciseId: 'pulldown' });
    expect(pull.candidateSets![0].sets[0]).toMatchObject({ weight: 27.5, completed: false });

    expect(merged.entries[0].weeklyTargets).toBeUndefined();
  });
});

describe('summarizeSets', () => {
  test('暖身組不算進重量與次數範圍，但算進組數', () => {
    expect(summarizeSets([set(10, 15, { isWarmup: true }), set(30, 8), set(32.5, 6)])).toMatchObject({
      sets: 3, topWeight: 32.5, minReps: 6, maxReps: 8,
    });
  });
});
