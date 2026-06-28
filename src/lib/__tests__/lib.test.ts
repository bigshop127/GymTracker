import { describe, test, expect } from 'vitest';
import { kgToLb, lbToKg, formatWeight } from '../units';
import { calculateE1rm } from '../e1rm';
import { calculateSetVolume, calculateEntryVolume, calculateWorkoutVolume } from '../volume';

describe('Units Library', () => {
  test('kgToLb conversion works correctly', () => {
    // 100 kg * 2.2046226 = 220.46226 lb
    expect(kgToLb(100)).toBeCloseTo(220.46226, 5);
  });

  test('lbToKg conversion works correctly', () => {
    // 220.46226 / 2.2046226 = 100 kg
    expect(lbToKg(220.46226)).toBeCloseTo(100, 5);
  });

  test('formatWeight correctly formats based on unit', () => {
    expect(formatWeight(100, 'kg')).toBe(100);
    expect(formatWeight(100, 'lb')).toBe(220.5); // 220.46226 rounded to 1 decimal
  });
});

describe('E1RM Library', () => {
  test('reps === 1 returns weight directly', () => {
    expect(calculateE1rm(100, 1, 'epley')).toBe(100);
    expect(calculateE1rm(100, 1, 'brzycki')).toBe(100);
  });

  test('Epley formula calculates correctly', () => {
    // 100 * (1 + 5/30) = 100 * 1.166666... ≈ 116.67
    expect(calculateE1rm(100, 5, 'epley')).toBeCloseTo(116.67, 1);
  });

  test('Brzycki formula calculates correctly', () => {
    // 100 * 36 / (37 - 5) = 3600 / 32 = 112.5
    expect(calculateE1rm(100, 5, 'brzycki')).toBe(112.5);
  });

  test('invalid values return 0', () => {
    expect(calculateE1rm(0, 5)).toBe(0);
    expect(calculateE1rm(100, 0)).toBe(0);
    expect(calculateE1rm(100, 38, 'brzycki')).toBe(0); // Brzycki invalid for reps >= 37
  });
});

describe('Volume Library', () => {
  const warmupSet = { weight: 50, reps: 10, isWarmup: true, completed: true };
  const incompleteSet = { weight: 100, reps: 5, isWarmup: false, completed: false };
  const workingSet1 = { weight: 100, reps: 5, isWarmup: false, completed: true };
  const workingSet2 = { weight: 100, reps: 4, isWarmup: false, completed: true };

  test('calculateSetVolume only counts completed working sets', () => {
    expect(calculateSetVolume(warmupSet)).toBe(0);
    expect(calculateSetVolume(incompleteSet)).toBe(0);
    expect(calculateSetVolume(workingSet1)).toBe(500);
  });

  test('calculateEntryVolume sums valid sets in entry', () => {
    const entry = {
      sets: [warmupSet, workingSet1, workingSet2, incompleteSet]
    };
    expect(calculateEntryVolume(entry)).toBe(900); // 500 + 400
  });

  test('calculateWorkoutVolume sums valid sets across entire workout', () => {
    const workout = {
      entries: [
        { sets: [warmupSet, workingSet1] }, // 500
        { sets: [workingSet2, incompleteSet] } // 400
      ]
    };
    expect(calculateWorkoutVolume(workout)).toBe(900);
  });
});
