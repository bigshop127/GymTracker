import { describe, test, expect } from 'vitest';
import { remapEntryExerciseIds } from '../exerciseIdMap';
import { seedExerciseId } from '../../data/seed-exercises';
import { type WorkoutEntry } from '../../db/schema';

function makeEntry(overrides: Partial<WorkoutEntry>): WorkoutEntry {
  return {
    id: 'entry-1',
    exerciseId: 'old-1',
    order: 0,
    sets: [],
    ...overrides,
  };
}

describe('seedExerciseId', () => {
  test('同一個名稱永遠得到同一個 id', () => {
    expect(seedExerciseId('槓鈴臥推')).toBe(seedExerciseId('槓鈴臥推'));
  });

  test('不同名稱不會撞在一起', () => {
    expect(seedExerciseId('槓鈴臥推')).not.toBe(seedExerciseId('啞鈴臥推'));
  });
});

describe('remapEntryExerciseIds', () => {
  test('改寫 exerciseId 並回報有變動', () => {
    const entries = [makeEntry({ exerciseId: 'old-1' })];
    const changed = remapEntryExerciseIds(entries, new Map([['old-1', 'seed:槓鈴臥推']]));
    expect(changed).toBe(true);
    expect(entries[0].exerciseId).toBe('seed:槓鈴臥推');
  });

  test('對照表沒命中就不動、也不回報變動', () => {
    const entries = [makeEntry({ exerciseId: 'keep-me' })];
    const changed = remapEntryExerciseIds(entries, new Map([['old-1', 'seed:槓鈴臥推']]));
    expect(changed).toBe(false);
    expect(entries[0].exerciseId).toBe('keep-me');
  });

  test('替代動作候選清單一併改寫', () => {
    const entries = [makeEntry({ exerciseId: 'old-1', candidateExerciseIds: ['old-1', 'old-2', 'custom-x'] })];
    const changed = remapEntryExerciseIds(
      entries,
      new Map([['old-1', 'seed:A'], ['old-2', 'seed:B']]),
    );
    expect(changed).toBe(true);
    expect(entries[0].candidateExerciseIds).toEqual(['seed:A', 'seed:B', 'custom-x']);
  });

  test('兩個舊 id 指向同一個新 id 時會去重', () => {
    const entries = [makeEntry({ candidateExerciseIds: ['old-1', 'old-2'] })];
    remapEntryExerciseIds(entries, new Map([['old-1', 'seed:A'], ['old-2', 'seed:A']]));
    expect(entries[0].candidateExerciseIds).toEqual(['seed:A']);
  });

  test('空對照表或無 entries 時安全返回', () => {
    expect(remapEntryExerciseIds([makeEntry({})], new Map())).toBe(false);
    expect(remapEntryExerciseIds(undefined, new Map([['a', 'b']]))).toBe(false);
  });
});
