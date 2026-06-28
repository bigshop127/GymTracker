// E1RM (預估一次最大重量) 計算公式
// 依據 docs/ROADMAP.md §2 衍生運算定義：
// - Epley：1RM = w × (1 + reps/30)
// - Brzycki：1RM = w × 36 / (37 − reps)（reps < 37）
// - reps === 1 時直接回傳 weight

/**
 * 計算預估一次最大重量 (E1RM)
 * @param weight 重量 (kg 或 lb)
 * @param reps 次數
 * @param formula 公式類型 'epley' | 'brzycki'
 */
export function calculateE1rm(
  weight: number,
  reps: number,
  formula: 'epley' | 'brzycki' = 'epley'
): number {
  if (reps <= 0 || weight <= 0) return 0;
  if (reps === 1) return weight;

  if (formula === 'brzycki') {
    if (reps >= 37) return 0; // Brzycki formula is only valid for reps < 37
    return weight * 36 / (37 - reps);
  }

  // default to epley
  return weight * (1 + reps / 30);
}
