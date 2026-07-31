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

/**
 * 把使用者在「顯示單位」下輸入的數字換回 kg（儲存單位）。
 * formatWeight 的反向操作：輸入欄位顯示用 formatWeight，回寫用這支。
 */
export function toKgFromDisplay(value: number, unit: 'kg' | 'lb'): number {
  return unit === 'kg' ? value : lbToKg(value);
}

/**
 * 重量輸入欄位的增減級距：kg 用 2.5（最小片一對），lb 用 5。
 */
export function weightStep(unit: 'kg' | 'lb'): number {
  return unit === 'kg' ? 2.5 : 5;
}
