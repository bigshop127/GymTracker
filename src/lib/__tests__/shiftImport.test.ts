import { describe, expect, test } from 'vitest';
import type { DayOverride } from '../../db/schema';
import {
  buildImportRows,
  existingStateOf,
  parseShiftLabel,
  rowStatus,
  summarizeRows,
  toOverrideInput,
  type ShiftScan,
} from '../shiftImport';

const ov = (id: string, extra: Partial<DayOverride>): DayOverride => ({ id, updatedAt: 1, ...extra });

describe('parseShiftLabel', () => {
  test('單班、雙班、三班', () => {
    expect(parseShiftLabel('A')).toMatchObject({ kind: 'shift', choice: 'A' });
    expect(parseShiftLabel('BC')).toMatchObject({ kind: 'shift', choice: 'BC' });
    expect(parseShiftLabel('ABC')).toMatchObject({ kind: 'shift', choice: 'ABC' });
  });
  test('AC早：算 AC，原文留在 rawLabel', () => {
    expect(parseShiftLabel('AC早')).toEqual({ kind: 'shift', choice: 'AC', letters: ['A', 'C'], rawLabel: 'AC早' });
  });
  test('字母順序不同也歸一（CA → AC）、小寫、空白', () => {
    expect(parseShiftLabel(' ca ')).toMatchObject({ choice: 'AC' });
  });
  test('休假', () => {
    expect(parseShiftLabel('休假')).toEqual({ kind: 'dayoff' });
  });
  test('看不懂的不亂猜', () => {
    expect(parseShiftLabel('')).toEqual({ kind: 'unknown' });
    expect(parseShiftLabel('AD')).toEqual({ kind: 'unknown' });
    expect(parseShiftLabel('AA')).toEqual({ kind: 'unknown' });
    expect(parseShiftLabel('特休123')).toEqual({ kind: 'unknown' });
  });
});

describe('existingStateOf', () => {
  test('各種登記狀態', () => {
    expect(existingStateOf(undefined)).toBe('none');
    expect(existingStateOf(ov('d', { shiftLetters: ['C', 'A'] }))).toBe('AC');
    expect(existingStateOf(ov('d', { isDayOff: true }))).toBe('dayoff');
    expect(existingStateOf(ov('d', { paused: true }))).toBe('paused');
    expect(existingStateOf(ov('d', { pinnedOutcome: 'rest' }))).toBe('none');
  });
});

describe('buildImportRows / rowStatus', () => {
  const scan: ShiftScan = {
    year: 2026,
    month: 11,
    days: [
      { day: 1, label: '休假' },
      { day: 2, label: 'AC' },
      { day: 3, label: 'AC早' },
      { day: 4, label: 'B' },
      { day: 5, label: '???' },
      { day: 6, label: 'A' },
    ],
  };
  const overrides = new Map<string, DayOverride>([
    ['2026-11-03', ov('2026-11-03', { shiftLetters: ['A', 'C'] })], // 與截圖相同
    ['2026-11-04', ov('2026-11-04', { shiftLetters: ['A'] })],      // 與截圖不同
    ['2026-11-06', ov('2026-11-06', { paused: true })],             // 自己標今日無法
  ]);

  test('今天以前的日子略過、不列入', () => {
    const { rows, skippedPast } = buildImportRows(scan, overrides, '2026-11-02');
    expect(skippedPast).toBe(1);
    expect(rows.map((r) => r.day)).toEqual([2, 3, 4, 5, 6]);
  });

  test('分成 新增／相同／會改掉／不更動', () => {
    const { rows } = buildImportRows(scan, overrides, '2026-11-02');
    const by = Object.fromEntries(rows.map((r) => [r.day, rowStatus(r)]));
    expect(by[2]).toBe('new');
    expect(by[3]).toBe('same');
    expect(by[4]).toBe('overwrite');
    expect(by[5]).toBe('keep');  // 讀不懂 → 不更動
    expect(by[6]).toBe('keep');  // 今日無法 → 預設保留
    expect(summarizeRows(rows)).toEqual({ same: 1, new: 1, overwrite: 1, keep: 2 });
  });

  test('使用者手動改選後狀態跟著變', () => {
    const { rows } = buildImportRows(scan, overrides, '2026-11-02');
    const day6 = rows.find((r) => r.day === 6)!;
    expect(rowStatus({ ...day6, choice: 'A' })).toBe('overwrite');
  });
});

describe('toOverrideInput', () => {
  const base = { dateStr: '2026-11-03', day: 3, existing: 'none' as const };
  test('AC早 → AC 並保留原文，保留指定部位', () => {
    const out = toOverrideInput(
      { ...base, label: 'AC早', choice: 'AC' },
      ov('2026-11-03', { pinnedSlotId: 'slot-x', paused: true }),
    );
    expect(out).toMatchObject({
      id: '2026-11-03', shiftLetters: ['A', 'C'], rawLabel: 'AC早', pinnedSlotId: 'slot-x',
    });
    expect(out.paused).toBeUndefined();
    expect(out.isDayOff).toBeUndefined();
  });
  test('手動改成別的班別時，rawLabel 用新班別', () => {
    const out = toOverrideInput({ ...base, label: 'AC早', choice: 'B' }, undefined);
    expect(out).toMatchObject({ shiftLetters: ['B'], rawLabel: 'B' });
  });
  test('休假', () => {
    const out = toOverrideInput({ ...base, label: '休假', choice: 'dayoff' }, undefined);
    expect(out).toMatchObject({ isDayOff: true, rawLabel: '休假' });
    expect(out.shiftLetters).toBeUndefined();
  });
});
