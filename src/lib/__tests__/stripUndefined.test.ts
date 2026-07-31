import { describe, test, expect } from 'vitest';
import { stripUndefined } from '../stripUndefined';

describe('stripUndefined', () => {
  test('移除頂層 undefined 鍵', () => {
    const out = stripUndefined({ id: 'w1', location: undefined, title: '拉' });
    expect(out).toEqual({ id: 'w1', title: '拉' });
    expect('location' in out).toBe(false);
  });

  test('移除陣列裡巢狀物件的 undefined 鍵（Firestore 炸點）', () => {
    const workout = {
      id: 'w1',
      entries: [
        { id: 'e1', exerciseId: 'x', defaultRestSeconds: undefined, sets: [{ id: 's1', reps: 12, rpe: undefined }] },
      ],
    };
    const out = stripUndefined(workout);
    expect(out.entries[0]).toEqual({ id: 'e1', exerciseId: 'x', sets: [{ id: 's1', reps: 12 }] });
  });

  test('保留 null、0、空字串與 false', () => {
    expect(stripUndefined({ a: null, b: 0, c: '', d: false })).toEqual({ a: null, b: 0, c: '', d: false });
  });

  test('不動純量', () => {
    expect(stripUndefined(5)).toBe(5);
    expect(stripUndefined('x')).toBe('x');
    expect(stripUndefined(null)).toBe(null);
  });
});
