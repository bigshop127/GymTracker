import { describe, test, expect } from 'vitest';
import {
  addDraftAlternative,
  addDraftEntry,
  applyWeekEdit,
  buildBlankTemplateFromProgramDay,
  isSkippedInWeek,
  moveDraftEntry,
  plannedCount,
  programAlternatives,
  removeDraftAlternative,
  restoreDraftEntry,
  setDraftTarget,
  skipDraftEntry,
  startWeekEdit,
  weekTargetOf,
} from '../programWeeks';
import { selectEntryExercise } from '../workoutEntries';
import { diffWorkoutAgainstTemplate, mergeWorkoutIntoTemplate } from '../templateDiff';
import type { SetLog, WeekTarget, Workout, WorkoutEntry, WorkoutTemplate } from '../../db/schema';

function set(weight: number, reps: number, extra: Partial<SetLog> = {}): SetLog {
  return { id: crypto.randomUUID(), weight, reps, isWarmup: false, completed: false, createdAt: 0, ...extra };
}
function weeks(...values: [number, number][]): WeekTarget[] {
  return values.map(([sets, reps]) => ({ sets, reps }));
}
function same(sets: number, reps: number): WeekTarget[] {
  return Array.from({ length: 8 }, () => ({ sets, reps }));
}
function entry(id: string, exerciseId: string, order: number, extra: Partial<WorkoutEntry> = {}): WorkoutEntry {
  return { id, exerciseId, order, sets: [set(40, 12), set(40, 12), set(40, 12), set(40, 12)], ...extra };
}
function template(entries: WorkoutEntry[]): WorkoutTemplate {
  return { id: 't1', name: '拉 (Pull)', category: '拉', location: '楊梅WG', entries, createdAt: 1, updatedAt: 1 };
}

// W1=4×12、W2=5×10、W4 減量 3×12 … 其餘沿用
const progression = weeks([4, 12], [5, 10], [5, 10], [3, 12], [5, 10], [6, 8], [6, 8], [2, 5]);

describe('weekTargetOf / isSkippedInWeek', () => {
  test('有週次目標照那週；超過長度夾在最後一週；沒有目標從存著的組推', () => {
    const e = entry('a', 'row', 0, { weeklyTargets: weeks([4, 12], [5, 10]) });
    expect(weekTargetOf(e, 0)).toEqual({ sets: 4, reps: 12 });
    expect(weekTargetOf(e, 6)).toEqual({ sets: 5, reps: 10 });
    expect(weekTargetOf(entry('b', 'row', 0), 3)).toEqual({ sets: 4, reps: 12 });
  });

  test('替代動作有自己的目標就用自己的，沒有就跟主動作', () => {
    const e = entry('a', 'row', 0, {
      weeklyTargets: same(4, 12),
      candidateExerciseIds: ['row', 'db-row', 'cable-row'],
      candidateSets: [{ exerciseId: 'db-row', sets: [set(20, 10)], weeklyTargets: same(3, 15) }],
    });
    expect(weekTargetOf(e, 2, 'db-row')).toEqual({ sets: 3, reps: 15 });
    expect(weekTargetOf(e, 2, 'cable-row')).toEqual({ sets: 4, reps: 12 });
  });

  test('那週 0 組＝跳過；沒有週次目標的一般動作不會被當成跳過', () => {
    const w = same(4, 12);
    w[2] = { sets: 0, reps: 12 };
    expect(isSkippedInWeek(entry('a', 'row', 0, { weeklyTargets: w }), 2)).toBe(true);
    expect(isSkippedInWeek(entry('a', 'row', 0, { weeklyTargets: w }), 1)).toBe(false);
    expect(isSkippedInWeek(entry('b', 'row', 0), 2)).toBe(false);
  });
});

describe('applyWeekEdit：8 週同步 vs 只改這週', () => {
  const tpl = template([
    entry('a', 'row', 0, { weeklyTargets: progression }),
    entry('b', 'pulldown', 1, { weeklyTargets: same(4, 10) }),
    entry('c', 'facepull', 2, { weeklyTargets: same(3, 15) }),
  ]);

  test('改組數：只改這週 → 其他週（含 W4 減量）不動', () => {
    const draft = setDraftTarget(startWeekEdit(tpl, 2), 'a', 'row', { sets: 6 });
    const saved = applyWeekEdit(tpl, draft, 'week');
    const a = saved.entries.find((e) => e.id === 'a')!;
    expect(a.weeklyTargets![2]).toEqual({ sets: 6, reps: 10 });
    expect(a.weeklyTargets![3]).toEqual({ sets: 3, reps: 12 });
    expect(a.weeklyTargets![0]).toEqual({ sets: 4, reps: 12 });
  });

  test('改組數：8 週同步 → 8 週都變成這週的數字；沒改的動作原封不動', () => {
    const draft = setDraftTarget(startWeekEdit(tpl, 2), 'a', 'row', { sets: 6, reps: 8 });
    const saved = applyWeekEdit(tpl, draft, 'all');
    expect(saved.entries.find((e) => e.id === 'a')!.weeklyTargets).toEqual(same(6, 8));
    expect(saved.entries.find((e) => e.id === 'b')).toBe(tpl.entries[1]);
  });

  test('刪動作：只改這週 → 只有這週 0 組；8 週同步 → 整個拿掉', () => {
    const draft = skipDraftEntry(startWeekEdit(tpl, 2), 'b');
    const week = applyWeekEdit(tpl, draft, 'week');
    const b = week.entries.find((e) => e.id === 'b')!;
    expect(b.weeklyTargets![2].sets).toBe(0);
    expect(b.weeklyTargets![1].sets).toBe(4);
    expect(isSkippedInWeek(b, 2)).toBe(true);

    const all = applyWeekEdit(tpl, draft, 'all');
    expect(all.entries.map((e) => e.id)).toEqual(['a', 'c']);
    expect(all.entries.map((e) => e.order)).toEqual([0, 1]);
  });

  test('新增動作：只改這週 → 其他週 0 組；8 週同步 → 8 週都有', () => {
    let draft = addDraftEntry(startWeekEdit(tpl, 2), 'shrug');
    const newId = draft.entries[3].id;
    draft = setDraftTarget(draft, newId, 'shrug', { sets: 2, reps: 20 });

    const week = applyWeekEdit(tpl, draft, 'week');
    const added = week.entries.find((e) => e.id === newId)!;
    expect(added.weeklyTargets!.map((t) => t.sets)).toEqual([0, 0, 2, 0, 0, 0, 0, 0]);

    const all = applyWeekEdit(tpl, draft, 'all');
    expect(all.entries.find((e) => e.id === newId)!.weeklyTargets).toEqual(same(2, 20));
  });

  test('這次才新增的動作按刪除 → 直接從草稿拿掉', () => {
    let draft = addDraftEntry(startWeekEdit(tpl, 0), 'shrug');
    const newId = draft.entries[3].id;
    draft = skipDraftEntry(draft, newId);
    expect(draft.entries.map((e) => e.id)).toEqual(['a', 'b', 'c']);
  });

  test('這週跳過的動作加回來：用這週原本的數字，原本就 0 的找最近一週', () => {
    const skipped = progression.map((t) => ({ ...t }));
    skipped[2] = { sets: 0, reps: 10 };
    const t2 = template([entry('a', 'row', 0, { weeklyTargets: skipped }), tpl.entries[1]]);
    const draft = restoreDraftEntry(startWeekEdit(t2, 2), t2, 'a');
    expect(weekTargetOf(draft.entries[0], 2)).toEqual({ sets: 5, reps: 10 });
    const saved = applyWeekEdit(t2, draft, 'week');
    expect(isSkippedInWeek(saved.entries[0], 2)).toBe(false);
  });

  test('只改這週刪掉後 8 週都 0 組的動作整個拿掉', () => {
    const onlyW3 = Array.from({ length: 8 }, (_, i) => ({ sets: i === 2 ? 3 : 0, reps: 10 }));
    const t2 = template([entry('a', 'row', 0, { weeklyTargets: onlyW3 }), tpl.entries[1]]);
    const saved = applyWeekEdit(t2, skipDraftEntry(startWeekEdit(t2, 2), 'a'), 'week');
    expect(saved.entries.map((e) => e.id)).toEqual(['b']);
  });

  test('至少要留一個動作：plannedCount 算這週實際要做的', () => {
    const draft = skipDraftEntry(skipDraftEntry(startWeekEdit(tpl, 2), 'a'), 'b');
    expect(plannedCount(draft)).toBe(1);
  });

  test('排序兩種都一樣套用', () => {
    const draft = moveDraftEntry(startWeekEdit(tpl, 2), 'c', 'up');
    expect(applyWeekEdit(tpl, draft, 'week').entries.map((e) => e.id)).toEqual(['a', 'c', 'b']);
    expect(applyWeekEdit(tpl, draft, 'all').entries.map((e) => e.id)).toEqual(['a', 'c', 'b']);
  });

  test('沒有週次目標的一般範本動作，改數字時先補滿 8 週（其他週照原本的組）', () => {
    const t2 = template([entry('a', 'row', 0)]);
    const saved = applyWeekEdit(t2, setDraftTarget(startWeekEdit(t2, 1), 'a', 'row', { reps: 8 }), 'week');
    const targets = saved.entries[0].weeklyTargets!;
    expect(targets).toHaveLength(8);
    expect(targets[1]).toEqual({ sets: 4, reps: 8 });
    expect(targets[0]).toEqual({ sets: 4, reps: 12 });
  });
});

describe('課表的替代動作', () => {
  const tpl = template([entry('a', 'row', 0, { weeklyTargets: progression })]);

  test('加替代：起始每週跟主動作一樣、存自己的起始組；改它的數字不影響主動作', () => {
    let draft = addDraftAlternative(startWeekEdit(tpl, 1), 'a', 'db-row', [set(22, 12)]);
    const alt = draft.entries[0].candidateSets!.find((c) => c.exerciseId === 'db-row')!;
    expect(alt.weeklyTargets).toEqual(progression);
    expect(alt.sets[0].weight).toBe(22);
    expect(draft.entries[0].candidateExerciseIds).toEqual(['row', 'db-row']);

    draft = setDraftTarget(draft, 'a', 'db-row', { sets: 3, reps: 15 });
    const week = applyWeekEdit(tpl, draft, 'week');
    expect(weekTargetOf(week.entries[0], 1, 'db-row')).toEqual({ sets: 3, reps: 15 });
    expect(weekTargetOf(week.entries[0], 0, 'db-row')).toEqual({ sets: 4, reps: 12 });
    expect(weekTargetOf(week.entries[0], 1)).toEqual({ sets: 5, reps: 10 });

    const all = applyWeekEdit(tpl, draft, 'all');
    expect(all.entries[0].candidateSets![0].weeklyTargets).toEqual(same(3, 15));
    expect(all.entries[0].weeklyTargets).toEqual(progression);
  });

  test('移除替代：候選剩一個就回到單一動作', () => {
    const draft = removeDraftAlternative(addDraftAlternative(startWeekEdit(tpl, 0), 'a', 'db-row', []), 'a', 'db-row');
    expect(draft.entries[0].candidateExerciseIds).toBeUndefined();
    expect(draft.entries[0].candidateSets).toBeUndefined();
  });

  test('開訓：替代照自己那週的組數次數；範本沒存重量就用上次做它的重量', () => {
    const e = entry('a', 'row', 0, {
      weeklyTargets: same(4, 12),
      candidateExerciseIds: ['row', 'db-row', 'machine-row'],
      candidateSets: [{ exerciseId: 'db-row', sets: [set(0, 15)], weeklyTargets: same(3, 15) }],
    });
    const { candidateSets } = programAlternatives(e, 2, (id) => (id === 'db-row' ? 24 : 50));
    const db = candidateSets!.find((c) => c.exerciseId === 'db-row')!;
    expect(db.sets).toHaveLength(3);
    expect(db.sets.every((s) => s.reps === 15 && s.weight === 24 && !s.completed)).toBe(true);
    // 沒存過的替代：跟主動作的組數次數，重量用上次的
    const machine = candidateSets!.find((c) => c.exerciseId === 'machine-row')!;
    expect(machine.sets).toHaveLength(4);
    expect(machine.sets[0].weight).toBe(50);
  });

  test('訓練前在範本編輯器切換替代：週次目標跟著換，原本的收進替代清單', () => {
    const e = entry('a', 'row', 0, {
      weeklyTargets: same(4, 12),
      candidateExerciseIds: ['row', 'db-row'],
      candidateSets: [{ exerciseId: 'db-row', sets: [set(20, 15)], weeklyTargets: same(3, 15) }],
    });
    const [swapped] = selectEntryExercise([e], 'a', 'db-row');
    expect(swapped.exerciseId).toBe('db-row');
    expect(swapped.weeklyTargets).toEqual(same(3, 15));
    expect(swapped.candidateSets).toEqual([{ exerciseId: 'row', sets: e.sets, weeklyTargets: same(4, 12) }]);
  });
});

describe('用某週內容產生空白範本', () => {
  test('組數×次數照那週、重量全部 0、跳過的動作不放、不帶週次目標', () => {
    const skipW3 = same(3, 15);
    skipW3[2] = { sets: 0, reps: 15 };
    const tpl = template([
      entry('a', 'row', 0, {
        weeklyTargets: progression,
        candidateExerciseIds: ['row', 'db-row'],
        candidateSets: [{ exerciseId: 'db-row', sets: [set(24, 12)], weeklyTargets: same(3, 12) }],
      }),
      entry('b', 'facepull', 1, { weeklyTargets: skipW3 }),
      entry('c', 'curl', 2, { sets: [set(10, 10, { isWarmup: true }), set(14, 10, { assistWeight: 5 })] }),
    ]);
    const blank = buildBlankTemplateFromProgramDay(tpl, 2, '拉 (Pull)・W3', 100);
    expect(blank.id).not.toBe(tpl.id);
    expect(blank.name).toBe('拉 (Pull)・W3');
    expect(blank.category).toBe('拉');
    expect(blank.location).toBe('楊梅WG');
    expect(blank.entries.map((e) => e.exerciseId)).toEqual(['row', 'curl']);
    expect(blank.entries.map((e) => e.order)).toEqual([0, 1]);

    const [row, curl] = blank.entries;
    expect(row.weeklyTargets).toBeUndefined();
    expect(row.sets).toHaveLength(5);
    expect(row.sets.every((s) => s.weight === 0 && s.reps === 10 && !s.completed)).toBe(true);
    expect(row.candidateExerciseIds).toEqual(['row', 'db-row']);
    expect(row.candidateSets![0].sets).toHaveLength(3);
    expect(row.candidateSets![0].sets.every((s) => s.weight === 0)).toBe(true);
    expect(row.candidateSets![0]).not.toHaveProperty('weeklyTargets');

    expect(curl.sets.map((s) => [s.weight, s.isWarmup])).toEqual([[0, true], [0, false]]);
    expect(curl.sets[1].assistWeight).toBeUndefined();
  });
});

describe('完成比對與「更新課表」遇到這週跳過的動作', () => {
  const skipW3 = same(4, 10);
  skipW3[2] = { sets: 0, reps: 10 };
  const tpl = template([
    entry('a', 'row', 0, { weeklyTargets: same(4, 12) }),
    entry('b', 'pulldown', 1, { weeklyTargets: skipW3 }),
    entry('c', 'facepull', 2, { weeklyTargets: same(3, 15) }),
  ]);
  function workout(entries: WorkoutEntry[]): Workout {
    return { id: 'w1', startedAt: 0, status: 'active', programCycleNumber: 3, entries };
  }

  test('跳過的動作不會被列成「沒做」', () => {
    const w = workout([
      entry('x', 'row', 0, { sets: [set(40, 12), set(40, 12), set(40, 12), set(40, 12)] }),
      entry('y', 'facepull', 1, { sets: [set(40, 15), set(40, 15), set(40, 15)] }),
    ]);
    const changes = diffWorkoutAgainstTemplate(tpl, w, 3);
    expect(changes.filter((c) => c.kind === 'removed')).toEqual([]);
  });

  test('更新課表：跳過的動作原樣留在原本位置', () => {
    const w = workout([
      entry('x', 'row', 0, { sets: [set(45, 12)] }),
      entry('y', 'facepull', 1, { sets: [set(12, 15)] }),
    ]);
    const merged = mergeWorkoutIntoTemplate(tpl, w, 5);
    expect(merged.entries.map((e) => e.id)).toEqual(['a', 'b', 'c']);
    expect(merged.entries[1].weeklyTargets).toEqual(skipW3);
    expect(merged.entries[0].sets[0].weight).toBe(45);
  });

  test('今天改做有自己週次目標的替代動作，更新後主動作換成它、週次也換成它的', () => {
    const t2 = template([
      entry('a', 'row', 0, {
        weeklyTargets: same(4, 12),
        candidateExerciseIds: ['row', 'db-row'],
        candidateSets: [{ exerciseId: 'db-row', sets: [set(20, 15)], weeklyTargets: same(3, 15) }],
      }),
    ]);
    const w = workout([
      entry('x', 'db-row', 0, {
        sets: [set(22, 15), set(22, 15), set(22, 15)],
        candidateExerciseIds: ['row', 'db-row'],
        candidateSets: [{ exerciseId: 'row', sets: [set(40, 12)] }],
      }),
    ]);
    const merged = mergeWorkoutIntoTemplate(t2, w, 5);
    expect(merged.entries[0].exerciseId).toBe('db-row');
    expect(merged.entries[0].weeklyTargets).toEqual(same(3, 15));
    expect(merged.entries[0].candidateSets![0].exerciseId).toBe('row');
    expect(merged.entries[0].candidateSets![0].weeklyTargets).toEqual(same(4, 12));
  });
});
