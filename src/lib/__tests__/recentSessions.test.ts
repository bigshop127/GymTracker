import { describe, test, expect } from 'vitest';
import { getRecentWorkoutsForSlot } from '../recentSessions';
import { type Workout } from '../../db/schema';

const DAY = 24 * 60 * 60 * 1000;
const now = 1_700_000_000_000;

const PROGRAM_ID = 'prog-1';
const SLOT_PUSH = 'slot-push';
const SLOT_PULL = 'slot-pull';

function makeWorkout(id: string, daysAgo: number, overrides: Partial<Workout> = {}): Workout {
  return {
    id,
    title: '推 (Push)',
    startedAt: now - daysAgo * DAY,
    entries: [],
    status: 'completed',
    ...overrides,
  };
}

describe('getRecentWorkoutsForSlot', () => {
  test('精準比對 programId + slotId，取最近 3 筆（新→舊）', () => {
    const workouts = [
      makeWorkout('w1', 1, { programId: PROGRAM_ID, programSlotId: SLOT_PUSH }),
      makeWorkout('w2', 8, { programId: PROGRAM_ID, programSlotId: SLOT_PUSH }),
      makeWorkout('w3', 15, { programId: PROGRAM_ID, programSlotId: SLOT_PUSH }),
      makeWorkout('w4', 22, { programId: PROGRAM_ID, programSlotId: SLOT_PUSH }),
    ];
    const result = getRecentWorkoutsForSlot(workouts, PROGRAM_ID, SLOT_PUSH, '推 (Push)');
    expect(result.map((w) => w.id)).toEqual(['w1', 'w2', 'w3']);
  });

  test('傳入順序亂掉也照 startedAt 由新到舊排', () => {
    const workouts = [
      makeWorkout('old', 15, { programId: PROGRAM_ID, programSlotId: SLOT_PUSH }),
      makeWorkout('new', 1, { programId: PROGRAM_ID, programSlotId: SLOT_PUSH }),
      makeWorkout('mid', 8, { programId: PROGRAM_ID, programSlotId: SLOT_PUSH }),
    ];
    const result = getRecentWorkoutsForSlot(workouts, PROGRAM_ID, SLOT_PUSH, '推 (Push)');
    expect(result.map((w) => w.id)).toEqual(['new', 'mid', 'old']);
  });

  test('精準比對不足 3 筆時，用 title 同類補位（且不重複）', () => {
    const workouts = [
      makeWorkout('exact', 1, { programId: PROGRAM_ID, programSlotId: SLOT_PUSH }),
      makeWorkout('byTitle1', 5, { title: '胸日' }),
      makeWorkout('byTitle2', 9, { title: '肩推日' }),
      makeWorkout('byTitle3', 12, { title: '推 (Push)' }),
    ];
    const result = getRecentWorkoutsForSlot(workouts, PROGRAM_ID, SLOT_PUSH, '推 (Push)');
    expect(result.map((w) => w.id)).toEqual(['exact', 'byTitle1', 'byTitle2']);
  });

  test('補位不會撈到別的分類', () => {
    const workouts = [
      makeWorkout('exact', 1, { programId: PROGRAM_ID, programSlotId: SLOT_PUSH }),
      makeWorkout('pull', 3, { title: '拉 (Pull)', programId: PROGRAM_ID, programSlotId: SLOT_PULL }),
      makeWorkout('leg', 4, { title: '腿 (Leg)' }),
    ];
    const result = getRecentWorkoutsForSlot(workouts, PROGRAM_ID, SLOT_PUSH, '推 (Push)');
    expect(result.map((w) => w.id)).toEqual(['exact']);
  });

  test('slot label 判不出分類（例如「有氧日」）→ 只回精準比對的結果', () => {
    const workouts = [
      makeWorkout('exact', 1, { title: '有氧日', programId: PROGRAM_ID, programSlotId: 'slot-cardio' }),
      makeWorkout('push', 2, { title: '推 (Push)' }),
    ];
    const result = getRecentWorkoutsForSlot(workouts, PROGRAM_ID, 'slot-cardio', '有氧日');
    expect(result.map((w) => w.id)).toEqual(['exact']);
  });

  test('只收 completed，進行中的草稿不算', () => {
    const workouts = [
      makeWorkout('active', 0, { status: 'active', programId: PROGRAM_ID, programSlotId: SLOT_PUSH }),
      makeWorkout('done', 2, { programId: PROGRAM_ID, programSlotId: SLOT_PUSH }),
    ];
    const result = getRecentWorkoutsForSlot(workouts, PROGRAM_ID, SLOT_PUSH, '推 (Push)');
    expect(result.map((w) => w.id)).toEqual(['done']);
  });

  test('濾掉軟刪除的墓碑（兩層來源都要濾）', () => {
    const workouts = [
      makeWorkout('deletedExact', 1, { programId: PROGRAM_ID, programSlotId: SLOT_PUSH, deletedAt: now }),
      makeWorkout('deletedByTitle', 2, { title: '胸日', deletedAt: now }),
      makeWorkout('alive', 3, { programId: PROGRAM_ID, programSlotId: SLOT_PUSH }),
    ];
    const result = getRecentWorkoutsForSlot(workouts, PROGRAM_ID, SLOT_PUSH, '推 (Push)');
    expect(result.map((w) => w.id)).toEqual(['alive']);
  });

  test('別的計畫的同一天不算精準比對，但仍可能靠 title 補位', () => {
    const workouts = [
      makeWorkout('otherProgram', 1, { programId: 'prog-old', programSlotId: SLOT_PUSH, title: '推 (Push)' }),
    ];
    const result = getRecentWorkoutsForSlot(workouts, PROGRAM_ID, SLOT_PUSH, '推 (Push)');
    expect(result.map((w) => w.id)).toEqual(['otherProgram']);
  });

  test('完全沒有紀錄 → 空陣列（呼叫端據此直接開訓、不跳選單）', () => {
    expect(getRecentWorkoutsForSlot([], PROGRAM_ID, SLOT_PUSH, '推 (Push)')).toEqual([]);
  });

  test('limit 可調', () => {
    const workouts = [
      makeWorkout('w1', 1, { programId: PROGRAM_ID, programSlotId: SLOT_PUSH }),
      makeWorkout('w2', 2, { programId: PROGRAM_ID, programSlotId: SLOT_PUSH }),
    ];
    expect(getRecentWorkoutsForSlot(workouts, PROGRAM_ID, SLOT_PUSH, '推 (Push)', 1).map((w) => w.id))
      .toEqual(['w1']);
  });
});
