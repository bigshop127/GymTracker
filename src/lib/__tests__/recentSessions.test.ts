import { describe, test, expect } from 'vitest';
import {
  getRecentWorkoutsForSlot,
  getRecentWorkoutsForMuscleGroup,
  getLastTrainedByMuscleGroup,
} from '../recentSessions';
import { buildExerciseMap } from '../workoutSummary';
import { type Workout, type Exercise, type WorkoutEntry, type SetLog } from '../../db/schema';

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

// ---- 部位流程（開始新訓練 → 選部位）----

function makeExercise(id: string, name: string, muscleGroup: Exercise['muscleGroup']): Exercise {
  return { id, name, muscleGroup, equipment: '其他', isCustom: false, createdAt: now };
}

const exMap = buildExerciseMap([
  makeExercise('bench', '槓鈴臥推', '胸'),
  makeExercise('fly', '蝴蝶機', '胸'),
  makeExercise('row', '槓鈴划船', '背'),
  makeExercise('curl', '二頭彎舉', '手臂'),
  makeExercise('squat', '深蹲', '腿臀'),
]);

function makeSet(): SetLog {
  return { id: crypto.randomUUID(), weight: 60, reps: 10, isWarmup: false, completed: true, createdAt: now };
}

function entriesOf(spec: [string, number][]): WorkoutEntry[] {
  return spec.map(([exerciseId, setCount], order) => ({
    id: `${exerciseId}-${order}`,
    exerciseId,
    order,
    sets: Array.from({ length: setCount }, makeSet),
  }));
}

describe('getRecentWorkoutsForMuscleGroup', () => {
  test('主要部位（組數最多）相符的優先，取最近 3 筆', () => {
    const workouts = [
      makeWorkout('chest1', 1, { entries: entriesOf([['bench', 4], ['curl', 2]]) }),
      makeWorkout('back1', 2, { entries: entriesOf([['row', 5]]) }),
      makeWorkout('chest2', 3, { entries: entriesOf([['fly', 3]]) }),
      makeWorkout('chest3', 4, { entries: entriesOf([['bench', 3]]) }),
      makeWorkout('chest4', 5, { entries: entriesOf([['bench', 3]]) }),
    ];
    expect(getRecentWorkoutsForMuscleGroup(workouts, '胸', exMap).map((w) => w.id))
      .toEqual(['chest1', 'chest2', 'chest3']);
  });

  test('主要部位不足 3 筆時，用「有練到就算」補位（新→舊、不重複）', () => {
    const workouts = [
      makeWorkout('chestMain', 1, { entries: entriesOf([['bench', 4], ['curl', 1]]) }),
      makeWorkout('backDay', 2, { entries: entriesOf([['row', 5], ['bench', 1]]) }),
      makeWorkout('legDay', 3, { entries: entriesOf([['squat', 5]]) }),
      makeWorkout('armDay', 4, { entries: entriesOf([['curl', 4], ['fly', 1]]) }),
    ];
    expect(getRecentWorkoutsForMuscleGroup(workouts, '胸', exMap).map((w) => w.id))
      .toEqual(['chestMain', 'backDay', 'armDay']);
  });

  test('標題不參與判定——看的是實際做過的動作', () => {
    const workouts = [
      makeWorkout('mislabeled', 1, { title: '腿 (Leg)', entries: entriesOf([['bench', 4]]) }),
      makeWorkout('emptyChestTitle', 2, { title: '胸日', entries: [] }),
    ];
    expect(getRecentWorkoutsForMuscleGroup(workouts, '胸', exMap).map((w) => w.id))
      .toEqual(['mislabeled']);
  });

  test('只收 completed、濾掉軟刪除', () => {
    const workouts = [
      makeWorkout('draft', 0, { status: 'active', entries: entriesOf([['bench', 4]]) }),
      makeWorkout('deleted', 1, { deletedAt: now, entries: entriesOf([['bench', 4]]) }),
      makeWorkout('alive', 2, { entries: entriesOf([['bench', 4]]) }),
    ];
    expect(getRecentWorkoutsForMuscleGroup(workouts, '胸', exMap).map((w) => w.id)).toEqual(['alive']);
  });

  test('孤兒動作（動作庫查無）不會被算成任何部位', () => {
    const workouts = [makeWorkout('ghost', 1, { entries: entriesOf([['nope', 4]]) })];
    expect(getRecentWorkoutsForMuscleGroup(workouts, '胸', exMap)).toEqual([]);
  });

  test('沒練過這個部位 → 空陣列（呼叫端據此直接開空白訓練）', () => {
    const workouts = [makeWorkout('back', 1, { entries: entriesOf([['row', 5]]) })];
    expect(getRecentWorkoutsForMuscleGroup(workouts, '核心', exMap)).toEqual([]);
  });
});

describe('getLastTrainedByMuscleGroup', () => {
  test('每個部位取最近一次的 startedAt（含次要部位）', () => {
    const workouts = [
      makeWorkout('recent', 1, { entries: entriesOf([['bench', 4], ['curl', 1]]) }),
      makeWorkout('older', 5, { entries: entriesOf([['bench', 4], ['row', 2]]) }),
    ];
    const map = getLastTrainedByMuscleGroup(workouts, exMap);
    expect(map.get('胸')).toBe(now - 1 * DAY);
    expect(map.get('手臂')).toBe(now - 1 * DAY);
    expect(map.get('背')).toBe(now - 5 * DAY);
    expect(map.has('腿臀')).toBe(false);
  });

  test('未完成與已刪除的不算', () => {
    const workouts = [
      makeWorkout('draft', 0, { status: 'active', entries: entriesOf([['squat', 4]]) }),
      makeWorkout('deleted', 0, { deletedAt: now, entries: entriesOf([['squat', 4]]) }),
    ];
    expect(getLastTrainedByMuscleGroup(workouts, exMap).has('腿臀')).toBe(false);
  });
});
