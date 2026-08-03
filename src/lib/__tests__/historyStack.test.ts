import { describe, test, expect } from 'vitest';
import {
  createHistoryStack,
  applyNavigation,
  canGoBack,
  canGoForward,
  type HistoryStackState,
} from '../historyStack';

function push(state: HistoryStackState, key: string) {
  return applyNavigation(state, key, 'PUSH');
}

function pop(state: HistoryStackState, key: string) {
  return applyNavigation(state, key, 'POP');
}

describe('historyStack', () => {
  test('剛開 App：兩個按鈕都不能按', () => {
    const state = createHistoryStack('a');
    expect(canGoBack(state)).toBe(false);
    expect(canGoForward(state)).toBe(false);
  });

  test('PUSH 之後可以往回，不能往前', () => {
    const state = push(createHistoryStack('a'), 'b');
    expect(state).toEqual({ keys: ['a', 'b'], index: 1 });
    expect(canGoBack(state)).toBe(true);
    expect(canGoForward(state)).toBe(false);
  });

  test('POP 回上一頁後，下一步變成可用', () => {
    let state = push(push(createHistoryStack('a'), 'b'), 'c');
    state = pop(state, 'b');
    expect(state.index).toBe(1);
    expect(canGoBack(state)).toBe(true);
    expect(canGoForward(state)).toBe(true);

    state = pop(state, 'a');
    expect(canGoBack(state)).toBe(false);
    expect(canGoForward(state)).toBe(true);
  });

  test('往回之後再開新頁：前面那段「下一步」要被截掉', () => {
    let state = push(push(createHistoryStack('a'), 'b'), 'c');
    state = pop(state, 'a');
    state = push(state, 'd');
    expect(state).toEqual({ keys: ['a', 'd'], index: 1 });
    expect(canGoForward(state)).toBe(false);
  });

  test('REPLACE 換掉當前那筆，游標與前後可用性不變', () => {
    let state = push(createHistoryStack('a'), 'b');
    state = pop(state, 'a');
    state = applyNavigation(state, 'a2', 'REPLACE');
    expect(state).toEqual({ keys: ['a2', 'b'], index: 0 });
    expect(canGoBack(state)).toBe(false);
    expect(canGoForward(state)).toBe(true);
  });

  test('同一個 key 重跑（StrictMode 雙呼叫）不改變狀態，且回傳同一個物件', () => {
    const state = push(createHistoryStack('a'), 'b');
    expect(push(state, 'b')).toBe(state);
    expect(pop(state, 'b')).toBe(state);
  });

  test('POP 到認不得的 key（重新整理後往回）：排到最前面，只開放下一步', () => {
    const state = pop(createHistoryStack('default'), 'ghost');
    expect(state).toEqual({ keys: ['ghost', 'default'], index: 0 });
    expect(canGoBack(state)).toBe(false);
    expect(canGoForward(state)).toBe(true);
  });

  test('超過上限就丟掉最舊的，游標仍指在最新那筆', () => {
    let state = createHistoryStack('k0');
    for (let i = 1; i < 60; i += 1) state = push(state, `k${i}`);
    expect(state.keys.length).toBe(50);
    expect(state.keys[0]).toBe('k10');
    expect(state.index).toBe(49);
    expect(state.keys[state.index]).toBe('k59');
  });
});
