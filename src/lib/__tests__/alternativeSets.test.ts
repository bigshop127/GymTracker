import { describe, test, expect } from 'vitest';
import {
  selectEntryExercise,
  removeAlternativeFromEntry,
  replaceEntryExercise,
  carryAlternatives,
  clonePlannedSets,
  defaultAlternativeSets,
  hasStoredCandidateSets,
} from '../workoutEntries';
import { remapEntryExerciseIds } from '../exerciseIdMap';
import { createTemplateFromWorkout } from '../../db/templates';
import type { SetLog, Workout, WorkoutEntry } from '../../db/schema';

function set(weight: number, reps: number, extra: Partial<SetLog> = {}): SetLog {
  return { id: crypto.randomUUID(), weight, reps, isWarmup: false, completed: false, createdAt: 0, ...extra };
}

// 滑輪下拉（25kg×12×2）⇄ 引體向上
function pulldownEntry(overrides: Partial<WorkoutEntry> = {}): WorkoutEntry {
  return {
    id: 'e1',
    exerciseId: 'pulldown',
    candidateExerciseIds: ['pulldown', 'pullup'],
    order: 0,
    sets: [set(25, 12), set(25, 12)],
    ...overrides,
  };
}

describe('替代動作各自的組數', () => {
  test('第一次切到沒做過的替代動作：同組數同次數、重量歸零，原本的組收起來', () => {
    const [entry] = selectEntryExercise([pulldownEntry()], 'e1', 'pullup');
    expect(entry.exerciseId).toBe('pullup');
    expect(entry.sets).toHaveLength(2);
    expect(entry.sets.every((s) => s.weight === 0 && s.reps === 12)).toBe(true);
    expect(entry.candidateSets).toEqual([
      { exerciseId: 'pulldown', sets: pulldownEntry().sets.map((s) => ({ ...s, id: expect.any(String) })) },
    ]);
    expect(entry.candidateSets![0].sets[0].weight).toBe(25);
  });

  test('有上次紀錄就用上次的（組數、重量、次數都照上次）', () => {
    const last = [set(-20, 8, { assistWeight: 20 }), set(-20, 8), set(-20, 6)];
    const [entry] = selectEntryExercise([pulldownEntry()], 'e1', 'pullup', last);
    expect(entry.sets).toBe(last);
  });

  test('切回去拿回自己原本的數字，切過去的那個也保留剛剛改的數字', () => {
    let entries = selectEntryExercise([pulldownEntry()], 'e1', 'pullup');
    // 在引體向上改了數字
    entries = entries.map((e) => ({ ...e, sets: [set(10, 6)] }));
    entries = selectEntryExercise(entries, 'e1', 'pulldown');
    expect(entries[0].exerciseId).toBe('pulldown');
    expect(entries[0].sets.map((s) => s.weight)).toEqual([25, 25]);
    expect(entries[0].candidateSets).toHaveLength(1);
    expect(entries[0].candidateSets![0].exerciseId).toBe('pullup');
    expect(entries[0].candidateSets![0].sets.map((s) => [s.weight, s.reps])).toEqual([[10, 6]]);

    entries = selectEntryExercise(entries, 'e1', 'pullup');
    expect(entries[0].sets.map((s) => [s.weight, s.reps])).toEqual([[10, 6]]);
    expect(entries[0].candidateSets!.map((c) => c.exerciseId)).toEqual(['pulldown']);
  });

  test('點目前已選定的那個＝沒事發生', () => {
    const entries = [pulldownEntry()];
    expect(selectEntryExercise(entries, 'e1', 'pulldown')).toEqual(entries);
  });

  test('hasStoredCandidateSets：選定的與存過的算有，沒存過的算沒有', () => {
    const entry = pulldownEntry({ candidateSets: [{ exerciseId: 'pullup', sets: [set(0, 8)] }] });
    expect(hasStoredCandidateSets(entry, 'pulldown')).toBe(true);
    expect(hasStoredCandidateSets(entry, 'pullup')).toBe(true);
    expect(hasStoredCandidateSets(pulldownEntry(), 'pullup')).toBe(false);
  });

  test('移除替代動作連它存的組一起拿掉；收回單一動作時替代欄位全清', () => {
    const entry = pulldownEntry({
      candidateExerciseIds: ['pulldown', 'pullup', 'row'],
      candidateSets: [
        { exerciseId: 'pullup', sets: [set(0, 8)] },
        { exerciseId: 'row', sets: [set(40, 10)] },
      ],
    });
    const [three] = removeAlternativeFromEntry([entry], 'e1', 'row');
    expect(three.candidateExerciseIds).toEqual(['pulldown', 'pullup']);
    expect(three.candidateSets!.map((c) => c.exerciseId)).toEqual(['pullup']);

    const [single] = removeAlternativeFromEntry([three], 'e1', 'pullup');
    expect(single.candidateExerciseIds).toBeUndefined();
    expect(single.candidateSets).toBeUndefined();
  });

  test('replaceEntryExercise 換成本來就是替代的動作：它存著的組作廢並收回單一動作', () => {
    const entry = pulldownEntry({ candidateSets: [{ exerciseId: 'pullup', sets: [set(0, 8)] }] });
    const [replaced] = replaceEntryExercise([entry], 'e1', 'pullup');
    expect(replaced.exerciseId).toBe('pullup');
    expect(replaced.candidateExerciseIds).toBeUndefined();
    expect(replaced.candidateSets).toBeUndefined();
    expect(replaced.sets.map((s) => s.weight)).toEqual([25, 25]);
  });

  test('defaultAlternativeSets：目前一組都沒有時給一組空白', () => {
    expect(defaultAlternativeSets([])).toHaveLength(1);
  });

  test('clonePlannedSets：換新 id、completed 歸零、不帶 rpe、保留輔助重量', () => {
    const original = set(30, 10, { completed: true, rpe: 9, assistWeight: 15 });
    const [copy] = clonePlannedSets([original], 123);
    expect(copy.id).not.toBe(original.id);
    expect(copy).toMatchObject({ weight: 30, reps: 10, completed: false, createdAt: 123, assistWeight: 15 });
    expect(copy.rpe).toBeUndefined();
  });
});

describe('carryAlternatives：帶到新訓練／新範本', () => {
  test('候選清單與各自組數都帶走，組數經過 mapSets 轉換', () => {
    const entry = pulldownEntry({ candidateSets: [{ exerciseId: 'pullup', sets: [set(0, 8, { completed: true })] }] });
    const carried = carryAlternatives(entry, (sets) => clonePlannedSets(sets));
    expect(carried.candidateExerciseIds).toEqual(['pulldown', 'pullup']);
    expect(carried.candidateSets![0].sets[0]).toMatchObject({ weight: 0, reps: 8, completed: false });
  });

  test('丟掉已不在候選清單、或等於當前選定的殘留組', () => {
    const entry = pulldownEntry({
      candidateSets: [
        { exerciseId: 'pulldown', sets: [set(1, 1)] },
        { exerciseId: 'ghost', sets: [set(1, 1)] },
      ],
    });
    const carried = carryAlternatives(entry, (s) => s);
    expect(carried.candidateExerciseIds).toEqual(['pulldown', 'pullup']);
    expect(carried.candidateSets).toBeUndefined();
  });

  test('單一動作什麼都不帶', () => {
    expect(carryAlternatives({ id: 'x', exerciseId: 'a', order: 0, sets: [] }, (s) => s)).toEqual({});
  });

  test('另存範本時每個替代動作的數字一起存', () => {
    const workout: Workout = {
      id: 'w',
      startedAt: 0,
      status: 'completed',
      entries: [pulldownEntry({ candidateSets: [{ exerciseId: 'pullup', sets: [set(-15, 8, { completed: true })] }] })],
    };
    const template = createTemplateFromWorkout(workout, '拉');
    expect(template.entries[0].candidateSets![0]).toMatchObject({ exerciseId: 'pullup' });
    expect(template.entries[0].candidateSets![0].sets[0]).toMatchObject({ weight: -15, reps: 8, completed: false });
  });
});

describe('remapEntryExerciseIds：替代動作存的組也要跟著換 id', () => {
  test('舊 id 換新 id；撞到當前選定的丟掉', () => {
    const entry = pulldownEntry({
      candidateExerciseIds: ['pulldown', 'old-pullup', 'old-dup'],
      candidateSets: [
        { exerciseId: 'old-pullup', sets: [set(0, 8)] },
        { exerciseId: 'old-dup', sets: [set(0, 8)] },
      ],
    });
    const changed = remapEntryExerciseIds([entry], new Map([['old-pullup', 'pullup'], ['old-dup', 'pulldown']]));
    expect(changed).toBe(true);
    expect(entry.candidateSets!.map((c) => c.exerciseId)).toEqual(['pullup']);
  });
});
