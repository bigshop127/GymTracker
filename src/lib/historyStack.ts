/**
 * 瀏覽紀錄堆疊——給 header 上的「前一步 / 下一步」用。
 *
 * 瀏覽器沒有「還能不能上一頁」這種查詢 API（history.length 不可靠），
 * 所以自己用 react-router 的 location.key 記一份堆疊：
 * PUSH 就截掉後面那段再接一筆、REPLACE 換掉當前那筆、POP 則把游標移到該 key 的位置。
 * 純函式，UI 只負責把 navigationType 餵進來。
 */

export interface HistoryStackState {
  /** location.key，由舊到新 */
  keys: string[];
  /** 目前所在的位置 */
  index: number;
}

export type NavigationKind = 'PUSH' | 'REPLACE' | 'POP';

/** 上限，避免長時間使用無限增長；超過就從最舊的丟掉。 */
const MAX_ENTRIES = 50;

export function createHistoryStack(key: string): HistoryStackState {
  return { keys: [key], index: 0 };
}

export function applyNavigation(
  state: HistoryStackState,
  key: string,
  kind: NavigationKind,
): HistoryStackState {
  // 同一筆重跑（StrictMode 雙呼叫、或 effect 被重觸發）不動，回傳原物件避免多餘 render
  if (state.keys[state.index] === key) return state;

  if (kind === 'REPLACE') {
    const keys = state.keys.slice();
    keys[state.index] = key;
    return { keys, index: state.index };
  }

  if (kind === 'POP') {
    const found = state.keys.indexOf(key);
    if (found >= 0) return { keys: state.keys, index: found };
    // 認不得的 key＝重新整理後回到「上輩子」留下的紀錄。保守假設是往回走：
    // 放到最前面 → 下一步可用（剛剛就是從那邊過來的）、前一步先關掉。
    return { keys: [key, ...state.keys].slice(0, MAX_ENTRIES), index: 0 };
  }

  // PUSH：丟掉「下一步」那一段，再接上新的
  const keys = [...state.keys.slice(0, state.index + 1), key];
  if (keys.length > MAX_ENTRIES) {
    const trimmed = keys.slice(keys.length - MAX_ENTRIES);
    return { keys: trimmed, index: trimmed.length - 1 };
  }
  return { keys, index: keys.length - 1 };
}

export function canGoBack(state: HistoryStackState): boolean {
  return state.index > 0;
}

export function canGoForward(state: HistoryStackState): boolean {
  return state.index < state.keys.length - 1;
}
