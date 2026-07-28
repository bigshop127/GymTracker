export interface RpeOption {
  value: number;
  label: string;
  shortLabel: string;
}

export const RPE_OPTIONS: RpeOption[] = [
  { value: 6,   label: '重量太輕下組嘗試加重', shortLabel: '太輕' },
  { value: 8,   label: '重量剛好',             shortLabel: '剛好' },
  { value: 9.5, label: '到這組接近力竭了',     shortLabel: '接近力竭' },
  { value: 10,  label: '這組太重下組要降',     shortLabel: '太重' },
];

/** 尋找最接近 RPE 值的選項 */
export function findClosestOption(rpe: number | undefined): RpeOption | null {
  if (rpe === undefined || rpe === null) return null;
  let closest = RPE_OPTIONS[0];
  let minDiff = Math.abs(rpe - closest.value);
  for (let i = 1; i < RPE_OPTIONS.length; i++) {
    const diff = Math.abs(rpe - RPE_OPTIONS[i].value);
    if (diff < minDiff) {
      minDiff = diff;
      closest = RPE_OPTIONS[i];
    }
  }
  return closest;
}

/** 把任意 rpe 數字（含舊資料的 7、8.5、9…）對應到最接近的標籤 */
export function rpeToLabel(rpe: number | undefined): string | null {
  const opt = findClosestOption(rpe);
  return opt ? opt.label : null;
}

/** 歷史卡片用的短標籤，避免長句撐爆版面 */
export function rpeToShortLabel(rpe: number | undefined): string | null {
  const opt = findClosestOption(rpe);
  return opt ? opt.shortLabel : null;
}
