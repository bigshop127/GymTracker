// 單位換算公式 (SSOT)
// 依據 docs/ROADMAP.md §2 衍生運算定義：1 kg = 2.2046226 lb

export const KG_TO_LB_FACTOR = 2.2046226;

/**
 * 將公斤 (kg) 換算為磅 (lb)
 */
export function kgToLb(kg: number): number {
  return kg * KG_TO_LB_FACTOR;
}

/**
 * 將磅 (lb) 換算為公斤 (kg)
 */
export function lbToKg(lb: number): number {
  return lb / KG_TO_LB_FACTOR;
}

/**
 * 依據顯示單位格式化重量，並四捨五入到小數點後指定位數
 */
export function formatWeight(weightInKg: number, unit: 'kg' | 'lb', decimals = 1): number {
  const value = unit === 'kg' ? weightInKg : kgToLb(weightInKg);
  const factor = Math.pow(10, decimals);
  return Math.round(value * factor) / factor;
}
