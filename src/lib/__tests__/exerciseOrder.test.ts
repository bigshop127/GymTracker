import { describe, test, expect } from 'vitest';
import { sortExercisesForDisplay } from '../exerciseOrder';
import { type Exercise } from '../../db/schema';

describe('sortExercisesForDisplay', () => {
  test('按照肌群順序排序：胸 > 背 > 腿臀 > 肩 > 手臂 > 核心 > 有氧', () => {
    const list: Partial<Exercise>[] = [
      { name: '棒式', muscleGroup: '核心', isCustom: false },
      { name: '槓鈴深蹲', muscleGroup: '腿臀', isCustom: false },
      { name: '槓鈴臥推', muscleGroup: '胸', isCustom: false },
      { name: '槓鈴肩推', muscleGroup: '肩', isCustom: false },
    ];

    const sorted = sortExercisesForDisplay(list as Exercise[]);
    expect(sorted.map(e => e.name)).toEqual(['槓鈴臥推', '槓鈴深蹲', '槓鈴肩推', '棒式']);
  });

  test('同肌群依 seed 定義順序排序，胸部順序：平板槓鈴 → 平板啞鈴 → 上斜槓鈴 → 上斜啞鈴', () => {
    const list: Partial<Exercise>[] = [
      { name: '上斜啞鈴臥推', muscleGroup: '胸', isCustom: false },
      { name: '槓鈴臥推', muscleGroup: '胸', isCustom: false },
      { name: '上斜槓鈴臥推', muscleGroup: '胸', isCustom: false },
      { name: '啞鈴臥推', muscleGroup: '胸', isCustom: false },
    ];

    const sorted = sortExercisesForDisplay(list as Exercise[]);
    expect(sorted.map(e => e.name)).toEqual([
      '槓鈴臥推',
      '啞鈴臥推',
      '上斜槓鈴臥推',
      '上斜啞鈴臥推',
    ]);
  });

  test('自訂動作排在同肌群的內建動作之後，且自訂動作依建立時間排序', () => {
    const list: Partial<Exercise>[] = [
      { name: '自訂胸動作B', muscleGroup: '胸', isCustom: true, createdAt: 200 },
      { name: '槓鈴臥推', muscleGroup: '胸', isCustom: false },
      { name: '自訂胸動作A', muscleGroup: '胸', isCustom: true, createdAt: 100 },
      { name: '啞鈴臥推', muscleGroup: '胸', isCustom: false },
    ];

    const sorted = sortExercisesForDisplay(list as Exercise[]);
    expect(sorted.map(e => e.name)).toEqual([
      '槓鈴臥推',
      '啞鈴臥推',
      '自訂胸動作A',
      '自訂胸動作B',
    ]);
  });
});
