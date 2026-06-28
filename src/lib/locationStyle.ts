/**
 * 地點 → 圖示顏色（hex）。用 inline style 設色，避免 Tailwind v4 動態 class 被 purge 掉。
 * (Phase 8 / v1.2)
 */
export function getLocationColor(location?: string): string {
  switch (location) {
    case '中壢建工':
      return '#3b82f6'; // blue-500
    case '楊梅WG':
      return '#f43f5e'; // rose-500
    default:
      return location ? '#94a3b8' : '#cbd5e1'; // 其他地點 (slate-400) : 無地點 (slate-300)
  }
}
