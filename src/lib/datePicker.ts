import type { MouseEvent } from 'react';

/**
 * 給 `<input type="date">` 的 onClick：點欄位任何地方（不只右邊的日曆圖示）都打開日曆。
 * 電腦版 Chrome 原生只有點圖示才開，點中間的數字只會選取年/月/日讓你打字。
 * 舊瀏覽器沒有 showPicker、或不允許時會丟錯 → 吞掉，維持原生行為。
 */
export function openDatePicker(e: MouseEvent<HTMLInputElement>): void {
  try {
    e.currentTarget.showPicker();
  } catch {
    // 不支援就算了，原生點圖示照樣能開
  }
}
