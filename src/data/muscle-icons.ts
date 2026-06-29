// 部位示意圖示（單色 SVG，地點上色用）
// 用途：日曆檢視中以「部位圖示 + 地點色」取代原本的單色圓點 (Phase 8 / v1.2)。
// 設計：每個部位一段極簡內層 SVG markup，viewBox 0 0 24 24，fill="currentColor"。
//   → 圖示顏色由外層 <svg> 的 CSS color 決定（見 src/lib/locationStyle.ts 的 getLocationColor）。
//   → 同一張圖換 color 即可得到「藍色胸圖 / 紅色胸圖」，不必每色畫一張。
//
// 渲染方式（呼叫端，例如 History.tsx 日曆格）：
//   const markup = getMuscleIcon(mg);
//   <svg viewBox="0 0 24 24" fill="currentColor" className="w-4 h-4"
//        style={{ color }} dangerouslySetInnerHTML={{ __html: markup }} />
//   （markup 為本檔作者自控的靜態字串，無使用者輸入，dangerouslySetInnerHTML 安全。）
//
// ⚠️ 這是「第一版」素材，刻意極簡、好辨識且可替換。日後想換更精緻的單色身體圖示，
//    只要把同一個 key 的 markup 換成新的內層 SVG（維持 fill="currentColor" 即自動沿用上色），
//    其餘接線完全不用動。

import type { MuscleGroup } from '../db/schema';

export const MUSCLE_ICON_SVG: Record<MuscleGroup, string> = {
  // 胸：兩塊上胸圓塊（pecs）
  '胸': '<circle cx="8" cy="10" r="4.3"/><circle cx="16" cy="10" r="4.3"/>',
  // 背：倒三角 V 字（V-taper / 背闊肌外擴）
  '背': '<path d="M3 5 L12 13 L21 5 L12 22 Z"/>',
  // 腿：兩根支柱（雙腿）
  '腿': '<rect x="5.5" y="3" width="5" height="18" rx="2.5"/><rect x="13.5" y="3" width="5" height="18" rx="2.5"/>',
  // 肩：圓拱肩線（三角肌罩）
  '肩': '<path d="M2 16 C2 9 7 7 12 7 C17 7 22 9 22 16 Z"/>',
  // 手臂：屈臂＋上臂圓塊（flex，代表二頭＋三頭）
  '手臂': '<path d="M7 21 v-8 h4 v8 z"/><path d="M11 13 h7 v-4 h-7 z"/><circle cx="11" cy="11" r="3.2"/>',
  // 核心：六塊腹肌方格
  '核心': '<rect x="6" y="3" width="5" height="5" rx="1.5"/><rect x="13" y="3" width="5" height="5" rx="1.5"/><rect x="6" y="9.5" width="5" height="5" rx="1.5"/><rect x="13" y="9.5" width="5" height="5" rx="1.5"/><rect x="6" y="16" width="5" height="5" rx="1.5"/><rect x="13" y="16" width="5" height="5" rx="1.5"/>',
  // 臀：兩塊下方圓塊（hips/glutes）
  '臀': '<circle cx="7.5" cy="14" r="5"/><circle cx="16.5" cy="14" r="5"/>',
  // 有氧：心形
  '有氧': '<path d="M12 21 C12 21 3 14 3 8.5 A4.5 4.5 0 0 1 12 6 A4.5 4.5 0 0 1 21 8.5 C21 14 12 21 12 21 Z"/>',
  // 全身：小人（頭＋身）
  '全身': '<circle cx="12" cy="5" r="3"/><path d="M9 10 h6 v7 h-2 v4 h-2 v-4 h-2 z"/>',
};

/**
 * 取得某部位的圖示內層 SVG markup。
 * 找不到（理論上不會，型別已涵蓋全部 MuscleGroup）回傳 null，呼叫端據此優雅降級（退回小圓點）。
 */
export function getMuscleIcon(mg: MuscleGroup): string | null {
  return MUSCLE_ICON_SVG[mg] ?? null;
}
