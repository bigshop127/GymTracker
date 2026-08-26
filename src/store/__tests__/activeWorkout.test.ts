import { describe, test, expect } from 'vitest';
import { buildEntrySets } from '../activeWorkout';
import type { WorkoutEntry } from '../../db/schema';

function makeEntry(overrides: Partial<WorkoutEntry> = {}): WorkoutEntry {
  return {
    id: 'e1',
    exerciseId: 'ex1',
    order: 0,
    sets: [
      { id: 's1', weight: 40, reps: 12, isWarmup: false, completed: true, createdAt: 0 },
      { id: 's2', weight: 40, reps: 12, isWarmup: false, completed: true, createdAt: 0 },
    ],
    ...overrides,
  };
}

describe('buildEntrySets：一般範本（沒有 weeklyTargets）', () => {
  test('照搬 entry.sets 的組數/次數/重量，只換新 id 並重置 completed', () => {
    const entry = makeEntry();
    const sets = buildEntrySets(entry, 1);
    expect(sets).toHaveLength(2);
    expect(sets.every((s) => s.weight === 40 && s.reps === 12 && s.completed === false)).toBe(true);
    expect(new Set(sets.map((s) => s.id)).size).toBe(2);
  });
});

describe('buildEntrySets：宗諺課表範本（有 weeklyTargets）', () => {
  const weeklyTargets = [
    { sets: 4, reps: 12 }, // W1
    { sets: 5, reps: 10 }, // W2
    { sets: 6, reps: 8, note: '測試1RM：65%×5, 75%×3, 85%×2, 95%×1' }, // W3
  ];

  test('cycleNumber=1 用第 1 週目標，組數/次數跟著換，重量沿用範本目前的第一組重量', () => {
    const entry = makeEntry({ weeklyTargets });
    const sets = buildEntrySets(entry, 1);
    expect(sets).toHaveLength(4);
    expect(sets.every((s) => s.reps === 12 && s.weight === 40)).toBe(true);
  });

  test('cycleNumber=2 用第 2 週目標', () => {
    const entry = makeEntry({ weeklyTargets });
    const sets = buildEntrySets(entry, 2);
    expect(sets).toHaveLength(5);
    expect(sets.every((s) => s.reps === 10)).toBe(true);
  });

  test('cycleNumber 超過 weeklyTargets 長度時，夾在最後一週（不會噴錯或變空）', () => {
    const entry = makeEntry({ weeklyTargets });
    const sets = buildEntrySets(entry, 99);
    expect(sets).toHaveLength(6);
    expect(sets.every((s) => s.reps === 8)).toBe(true);
  });

  test('cycleNumber=0（防呆）夾在第 1 週，不會出現負索引', () => {
    const entry = makeEntry({ weeklyTargets });
    const sets = buildEntrySets(entry, 0);
    expect(sets).toHaveLength(4);
    expect(sets.every((s) => s.reps === 12)).toBe(true);
  });

  test('新生成的組一律 isWarmup=false、completed=false', () => {
    const entry = makeEntry({ weeklyTargets });
    const sets = buildEntrySets(entry, 1);
    expect(sets.every((s) => s.isWarmup === false && s.completed === false)).toBe(true);
  });
});
