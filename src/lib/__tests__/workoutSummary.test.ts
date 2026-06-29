import { describe, test, expect } from 'vitest';
import type { Workout, Exercise } from '../../db/schema';
import {
  buildExerciseMap,
  getMuscleGroupCounts,
  getPrimaryMuscleGroups,
  buildAutoWorkoutTitle,
  getDaySummary
} from '../workoutSummary';

describe('Workout Summary Library', () => {
  const mockExercises: Exercise[] = [
    {
      id: 'ex1',
      name: '槓鈴臥推',
      muscleGroup: '胸',
      equipment: '槓鈴',
      isCustom: false,
      createdAt: Date.now()
    },
    {
      id: 'ex2',
      name: '滑輪下拉',
      muscleGroup: '背',
      equipment: '纜繩',
      isCustom: false,
      createdAt: Date.now()
    },
    {
      id: 'ex3',
      name: '啞鈴手臂彎舉',
      muscleGroup: '手臂',
      equipment: '啞鈴',
      isCustom: false,
      createdAt: Date.now()
    }
  ];

  const exMap = buildExerciseMap(mockExercises);

  test('buildExerciseMap converts array to map', () => {
    expect(exMap.size).toBe(3);
    expect(exMap.get('ex1')?.name).toBe('槓鈴臥推');
  });

  test('getMuscleGroupCounts accumulates sets correctly including warmup', () => {
    const workout: Workout = {
      id: 'w1',
      startedAt: Date.now(),
      status: 'completed',
      entries: [
        {
          id: 'entry1',
          exerciseId: 'ex1',
          order: 1,
          sets: [
            { id: 's1', weight: 60, reps: 10, isWarmup: true, completed: true, createdAt: Date.now() },
            { id: 's2', weight: 80, reps: 8, isWarmup: false, completed: true, createdAt: Date.now() }
          ]
        },
        {
          id: 'entry2',
          exerciseId: 'ex3',
          order: 2,
          sets: [
            { id: 's3', weight: 15, reps: 12, isWarmup: false, completed: true, createdAt: Date.now() }
          ]
        },
        {
          id: 'entry3',
          exerciseId: 'ex1',
          order: 3,
          sets: [
            { id: 's4', weight: 80, reps: 8, isWarmup: false, completed: true, createdAt: Date.now() }
          ]
        }
      ]
    };

    const counts = getMuscleGroupCounts(workout, exMap);
    expect(counts.get('胸')).toBe(3); // 2 sets in entry1 + 1 set in entry3
    expect(counts.get('手臂')).toBe(1);
    expect(counts.get('背')).toBeUndefined();
  });

  test('getPrimaryMuscleGroups sorts by sets and tie-breaks by first appearance', () => {
    const workout: Workout = {
      id: 'w1',
      startedAt: Date.now(),
      status: 'completed',
      entries: [
        {
          id: 'entry1',
          exerciseId: 'ex3', // 手臂 (first appearance index order: 1)
          order: 1,
          sets: [{ id: 's1', weight: 10, reps: 10, isWarmup: false, completed: true, createdAt: Date.now() }]
        },
        {
          id: 'entry2',
          exerciseId: 'ex1', // 胸 (first appearance index order: 2)
          order: 2,
          sets: [{ id: 's2', weight: 10, reps: 10, isWarmup: false, completed: true, createdAt: Date.now() }]
        }
      ]
    };

    // Both '手臂' and '胸' have 1 set. First appearance is '手臂'.
    const primary = getPrimaryMuscleGroups(workout, exMap);
    expect(primary).toEqual(['手臂', '胸']);
  });

  test('buildAutoWorkoutTitle formats correctly', () => {
    // 2026-06-28 23:00:00 (local time representation)
    const startedAt = new Date(2026, 5, 28, 23, 0).getTime();
    
    const workout: Workout = {
      id: 'w1',
      startedAt,
      status: 'completed',
      entries: [
        {
          id: 'entry1',
          exerciseId: 'ex1', // 胸, 2 sets
          order: 1,
          sets: [
            { id: 's1', weight: 60, reps: 10, isWarmup: false, completed: true, createdAt: Date.now() },
            { id: 's2', weight: 80, reps: 8, isWarmup: false, completed: true, createdAt: Date.now() }
          ]
        },
        {
          id: 'entry2',
          exerciseId: 'ex3', // 手臂, 1 set
          order: 2,
          sets: [
            { id: 's3', weight: 15, reps: 12, isWarmup: false, completed: true, createdAt: Date.now() }
          ]
        }
      ]
    };

    const title = buildAutoWorkoutTitle(workout, exMap);
    expect(title).toBe('6/28 胸+手臂');

    // Empty workout
    const emptyWorkout: Workout = {
      id: 'w2',
      startedAt,
      status: 'completed',
      entries: []
    };
    expect(buildAutoWorkoutTitle(emptyWorkout, exMap)).toBe('6/28 訓練');
  });

  test('getDaySummary chooses primary location and muscle correctly', () => {
    const w1: Workout = {
      id: 'w1',
      startedAt: 1000,
      location: '中壢建工',
      status: 'completed',
      entries: [
        {
          id: 'entry1',
          exerciseId: 'ex1', // 胸, 2 sets
          order: 1,
          sets: [
            { id: 's1', weight: 60, reps: 10, isWarmup: false, completed: true, createdAt: Date.now() },
            { id: 's2', weight: 80, reps: 8, isWarmup: false, completed: true, createdAt: Date.now() }
          ]
        }
      ]
    };

    const w2: Workout = {
      id: 'w2',
      startedAt: 2000,
      location: '楊梅WG',
      status: 'completed',
      entries: [
        {
          id: 'entry2',
          exerciseId: 'ex2', // 背, 3 sets (more sets than w1)
          order: 1,
          sets: [
            { id: 's3', weight: 50, reps: 10, isWarmup: false, completed: true, createdAt: Date.now() },
            { id: 's4', weight: 50, reps: 10, isWarmup: false, completed: true, createdAt: Date.now() },
            { id: 's5', weight: 50, reps: 10, isWarmup: false, completed: true, createdAt: Date.now() }
          ]
        }
      ]
    };

    const summary = getDaySummary([w1, w2], exMap);
    expect(summary.location).toBe('楊梅WG');
    expect(summary.primaryMuscle).toBe('背');
  });
});
