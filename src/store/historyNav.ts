import { create } from 'zustand';
import {
  applyNavigation,
  createHistoryStack,
  type HistoryStackState,
  type NavigationKind,
} from '../lib/historyStack';

/**
 * 瀏覽紀錄的游標。瀏覽器 history 是 React 之外的東西，所以放在 store 裡，
 * 由 Layout 的 header 按鈕訂閱（而不是每頁自己記一份 state）。
 */
interface HistoryNavState {
  stack: HistoryStackState;
  /** 記下一次導覽。同一個 location.key 重覆餵進來不會有副作用。 */
  record: (key: string, kind: NavigationKind) => void;
}

/** keys 空的＝App 剛啟動、還沒記到任何一筆；此時前後都不能按。 */
const UNINITIALIZED: HistoryStackState = { keys: [], index: 0 };

export const useHistoryNavStore = create<HistoryNavState>((set, get) => ({
  stack: UNINITIALIZED,
  record: (key, kind) => {
    const prev = get().stack;
    const next = prev.keys.length === 0 ? createHistoryStack(key) : applyNavigation(prev, key, kind);
    if (next !== prev) set({ stack: next });
  },
}));
