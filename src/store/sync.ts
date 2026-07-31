import { create } from 'zustand';
import { isConfigured } from '../lib/firebase';
import { signInWithGoogle, signOut, onAuthChange, type User } from '../sync/auth';
import { fullSync, deltaSync } from '../sync/sync';
import { useActiveWorkoutStore } from './activeWorkout';

type SyncStatus = 'idle' | 'syncing' | 'error';

interface SyncState {
  user: User | null;
  syncStatus: SyncStatus;
  lastSyncAt: number | null;
  errorMessage: string | null;
  isFirebaseConfigured: boolean;

  initAuth: () => () => void;
  signIn: () => Promise<void>;
  signOut: () => Promise<void>;
  sync: () => Promise<void>;
}

export const useSyncStore = create<SyncState>((set, get) => ({
  user: null,
  syncStatus: 'idle',
  lastSyncAt: null,
  errorMessage: null,
  isFirebaseConfigured: isConfigured(),

  initAuth: () => {
    if (!isConfigured()) return () => {};
    const unsub = onAuthChange(async (user) => {
      set({ user });
      if (user) {
        const stored = localStorage.getItem(`gymtracker.lastSyncAt.${user.uid}`);
        set({ lastSyncAt: stored ? parseInt(stored, 10) : null });
        await get().sync();
      } else {
        set({ lastSyncAt: null });
      }
    });

    // Delta sync on visibility change
    const handleVisibility = () => {
      const { user, lastSyncAt } = get();
      if (!document.hidden && user && lastSyncAt) {
        get().sync().catch(console.error);
      }
    };
    document.addEventListener('visibilitychange', handleVisibility);

    return () => {
      unsub();
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  },

  signIn: async () => {
    try {
      set({ syncStatus: 'syncing', errorMessage: null });
      await signInWithGoogle();
      // onAuthChange will trigger fullSync
    } catch (err) {
      set({ syncStatus: 'error', errorMessage: err instanceof Error ? err.message : '登入失敗' });
    }
  },

  signOut: async () => {
    await signOut();
    set({ user: null, lastSyncAt: null });
  },

  sync: async () => {
    const { user } = get();
    if (!user) return;
    try {
      set({ syncStatus: 'syncing', errorMessage: null });
      const { lastSyncAt } = get();
      let repaired = 0;
      if (lastSyncAt) {
        const SYNC_CLOCK_SKEW_MS = 5 * 60 * 1000;
        repaired = await deltaSync(user.uid, Math.max(0, lastSyncAt - SYNC_CLOCK_SKEW_MS));
      } else {
        repaired = await fullSync(user.uid);
      }
      // 修好舊動作 id 後，記憶體中的訓練草稿是舊的，得重讀避免被覆寫回去
      if (repaired > 0) {
        await useActiveWorkoutStore.getState().initActiveWorkout();
      }
      const now = Date.now();
      localStorage.setItem(`gymtracker.lastSyncAt.${user.uid}`, now.toString());
      set({ syncStatus: 'idle', lastSyncAt: now });
    } catch (err) {
      console.error('Sync error:', err);
      set({ syncStatus: 'error', errorMessage: err instanceof Error ? err.message : '同步失敗' });
    }
  },
}));
