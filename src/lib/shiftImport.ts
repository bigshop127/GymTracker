import type { DayOverride, ShiftLetter } from '../db/schema';

/** 預覽頁每一天可選的結果。'keep'＝不更動這天原本的登記 */
export type ImportChoice = 'keep' | 'dayoff' | 'A' | 'B' | 'C' | 'AB' | 'AC' | 'BC' | 'ABC';

export const IMPORT_CHOICES: { value: ImportChoice; label: string }[] = [
  { value: 'keep', label: '不更動' },
  { value: 'dayoff', label: '休假' },
  { value: 'A', label: 'A' },
  { value: 'B', label: 'B' },
  { value: 'C', label: 'C' },
  { value: 'AB', label: 'AB' },
  { value: 'AC', label: 'AC' },
  { value: 'BC', label: 'BC' },
  { value: 'ABC', label: 'ABC' },
];

/** Worker 回傳的辨識結果 */
export interface ShiftScan {
  year: number;
  month: number;
  days: { day: number; label: string }[];
}

export type ParsedLabel =
  | { kind: 'dayoff' }
  | { kind: 'shift'; choice: ImportChoice; letters: ShiftLetter[]; rawLabel: string }
  | { kind: 'unknown' };

/**
 * 把截圖上的班別文字轉成 app 的班別。
 * `AC早` 這類帶中文字尾的照樣算 AC，原文留在 rawLabel；看不懂的（例如 `AD`、空白）回 unknown，預設不更動。
 */
export function parseShiftLabel(label: string): ParsedLabel {
  const text = label.replace(/\s+/g, '').toUpperCase();
  if (!text) return { kind: 'unknown' };
  if (/^休/.test(text)) return { kind: 'dayoff' };
  const m = /^([ABC]+)([一-鿿]{0,2})$/.exec(text);
  if (!m) return { kind: 'unknown' };
  const letters = [...m[1]];
  if (new Set(letters).size !== letters.length) return { kind: 'unknown' };
  const sorted = [...letters].sort() as ShiftLetter[];
  return {
    kind: 'shift',
    choice: sorted.join('') as ImportChoice,
    letters: sorted,
    rawLabel: text,
  };
}

/** 這天目前在 app 裡的登記狀態（用來跟截圖比對） */
export type ExistingState = 'none' | 'paused' | 'dayoff' | Exclude<ImportChoice, 'keep' | 'dayoff'>;

export function existingStateOf(override: DayOverride | undefined | null): ExistingState {
  if (!override) return 'none';
  if (override.isDayOff) return 'dayoff';
  if (override.shiftLetters && override.shiftLetters.length > 0) {
    return [...override.shiftLetters].sort().join('') as ExistingState;
  }
  if (override.paused || override.forcedRest) return 'paused';
  return 'none';
}

export function describeExisting(state: ExistingState): string {
  if (state === 'none') return '未登記';
  if (state === 'paused') return '今日無法';
  if (state === 'dayoff') return '休假';
  return state;
}

export interface ImportRow {
  dateStr: string;
  day: number;
  label: string;          // 截圖上讀到的原文
  existing: ExistingState;
  choice: ImportChoice;   // 預設＝截圖辨識結果；使用者可在預覽頁改
}

export interface BuiltRows {
  rows: ImportRow[];
  skippedPast: number;    // 今天以前的日子（app 不讓改），不列入
}

const pad = (n: number) => String(n).padStart(2, '0');

export function buildImportRows(
  scan: ShiftScan,
  overridesByDate: Map<string, DayOverride>,
  todayDateStr: string,
): BuiltRows {
  const rows: ImportRow[] = [];
  let skippedPast = 0;
  for (const { day, label } of scan.days) {
    const dateStr = `${scan.year}-${pad(scan.month)}-${pad(day)}`;
    if (dateStr < todayDateStr) {
      skippedPast += 1;
      continue;
    }
    const existing = existingStateOf(overridesByDate.get(dateStr));
    const parsed = parseShiftLabel(label);
    let choice: ImportChoice = 'keep';
    if (parsed.kind === 'dayoff') choice = 'dayoff';
    else if (parsed.kind === 'shift') choice = parsed.choice;
    // 你自己標了「今日無法」的日子不跟班別搶：預設保留，要覆蓋就在預覽頁手動改
    if (existing === 'paused') choice = 'keep';
    rows.push({ dateStr, day, label, existing, choice });
  }
  rows.sort((a, b) => (a.dateStr < b.dateStr ? -1 : 1));
  return { rows, skippedPast };
}

export type RowStatus = 'same' | 'new' | 'overwrite' | 'keep';

/** same＝跟 app 現在一樣不用動；new＝這天原本沒登記；overwrite＝會改掉原本的登記；keep＝你選了不更動 */
export function rowStatus(row: ImportRow): RowStatus {
  if (row.choice === 'keep') return 'keep';
  if (row.existing === row.choice) return 'same';
  return row.existing === 'none' ? 'new' : 'overwrite';
}

/** 要寫進資料庫的內容；只保留指定部位／指定休息，不碰（它們跟班別是獨立維度） */
export function toOverrideInput(
  row: ImportRow,
  existing: DayOverride | undefined,
): Omit<DayOverride, 'updatedAt'> {
  const base = {
    id: row.dateStr,
    pinnedSlotId: existing?.pinnedSlotId,
    pinnedOutcome: existing?.pinnedOutcome,
    paused: undefined,
    forcedRest: undefined,
  };
  if (row.choice === 'dayoff') {
    return { ...base, isDayOff: true, shiftLetters: undefined, rawLabel: '休假' };
  }
  const letters = [...row.choice].sort() as ShiftLetter[];
  const parsed = parseShiftLabel(row.label);
  // 使用者沒改過、截圖原文帶字尾（例如 AC早）時，原文留著當顯示用
  const rawLabel = parsed.kind === 'shift' && parsed.choice === row.choice ? parsed.rawLabel : row.choice;
  return { ...base, isDayOff: undefined, shiftLetters: letters, rawLabel };
}

export function summarizeRows(rows: ImportRow[]): Record<RowStatus, number> {
  const out: Record<RowStatus, number> = { same: 0, new: 0, overwrite: 0, keep: 0 };
  for (const r of rows) out[rowStatus(r)] += 1;
  return out;
}
