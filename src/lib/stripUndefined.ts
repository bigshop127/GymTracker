/**
 * 深層移除物件／陣列中值為 undefined 的鍵。
 *
 * Firestore 不接受 undefined 欄位，一筆帶 undefined 的資料會讓 setDoc() 直接拋錯，
 * 進而害整輪同步中斷（見 src/sync/sync.ts）。本函式用於送上雲端前的最後清理。
 *
 * 注意：只處理純物件與陣列，其餘型別（含 null）原樣返回。
 */
export function stripUndefined<T>(value: T): T {
  if (Array.isArray(value)) {
    return value.map((item) => stripUndefined(item)) as T;
  }
  if (value !== null && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [key, val] of Object.entries(value as Record<string, unknown>)) {
      if (val !== undefined) out[key] = stripUndefined(val);
    }
    return out as T;
  }
  return value;
}
