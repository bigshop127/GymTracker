import { describe, test, expect } from 'vitest';
import { type Workout } from '../../db/schema';
import { calculateTrendPoints } from '../trends';

describe('Trends Calculation', () => {
  const dummyWorkout1: Workout = {
    id: 'w1',
    startedAt: 1000000,
    endedAt: 2000000,
    status: 'completed',
    entries: [
      {
        id: 'e1_1',
        exerciseId: 'ex1',
        order: 1,
        sets: [
          { id: 's1', weight: 100, reps: 5, isWarmup: false, completed: true, createdAt: 0 },
          { id: 's2', weight: 105, reps: 5, isWarmup: false, completed: true, createdAt: 0 },
          { id: 's3', weight: 110, reps: 5, isWarmup: true, completed: true, createdAt: 0 }, // warmup, should be ignored
          { id: 's4', weight: 120, reps: 5, isWarmup: false, completed: false, createdAt: 0 }, // incomplete, should be ignored
        ]
      }
    ]
  };

  const dummyWorkout2: Workout = {
    id: 'w2',
    startedAt: 3000000,
    endedAt: 4000000,
    status: 'completed',
    entries: [
      {
        id: 'e2_1',
        exerciseId: 'ex1',
        order: 1,
        sets: [
          { id: 's5', weight: 110, reps: 3, isWarmup: false, completed: true, createdAt: 0 },
          { id: 's6', weight: 115, reps: 1, isWarmup: false, completed: true, createdAt: 0 },
        ]
      }
    ]
  };

  const dummyWorkoutActive: Workout = {
    id: 'w_active',
    startedAt: 5000000,
    status: 'active', // active workout should be ignored
    entries: [
      {
        id: 'e3_1',
        exerciseId: 'ex1',
        order: 1,
        sets: [
          { id: 's7', weight: 120, reps: 5, isWarmup: false, completed: true, createdAt: 0 }
        ]
      }
    ]
  };

  const workoutsList = [dummyWorkout2, dummyWorkoutActive, dummyWorkout1];

  test('calculates e1rm trend points correctly', () => {
    // For w1 (startedAt: 1000000):
    // valid sets: [100kg x 5], [105kg x 5]
    // e1rm for 100kg x 5 (epley) = 100 * (1 + 5/30) = 116.666
    // e1rm for 105kg x 5 (epley) = 105 * (1 + 5/30) = 122.5
    // Max e1rm = 122.5
    // For w2 (startedAt: 3000000):
    // valid sets: [110kg x 3], [115kg x 1]
    // e1rm for 110kg x 3 = 110 * (1 + 3/30) = 121
    // e1rm for 115kg x 1 = 115 (since reps === 1)
    // Max e1rm = 121
    const points = calculateTrendPoints(workoutsList, 'ex1', 'e1rm', 'epley');
    expect(points).toHaveLength(2);
    expect(points[0].date).toBe(1000000);
    expect(points[0].value).toBeCloseTo(122.5, 3);
    expect(points[1].date).toBe(3000000);
    expect(points[1].value).toBeCloseTo(121, 3);
  });

  test('calculates maxWeight trend points correctly', () => {
    // w1: max valid set weight = 105
    // w2: max valid set weight = 115
    const points = calculateTrendPoints(workoutsList, 'ex1', 'maxWeight', 'epley');
    expect(points).toHaveLength(2);
    expect(points[0].date).toBe(1000000);
    expect(points[0].value).toBe(105);
    expect(points[1].date).toBe(3000000);
    expect(points[1].value).toBe(115);
  });

  test('calculates volume trend points correctly', () => {
    // w1: 100*5 + 105*5 = 500 + 525 = 1025
    // w2: 110*3 + 115*1 = 330 + 115 = 445
    const points = calculateTrendPoints(workoutsList, 'ex1', 'volume', 'epley');
    expect(points).toHaveLength(2);
    expect(points[0].date).toBe(1000000);
    expect(points[0].value).toBe(1025);
    expect(points[1].date).toBe(3000000);
    expect(points[1].value).toBe(445);
  });
});
