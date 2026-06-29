import { create } from 'zustand';
import { isConfigured } from '../lib/firebase';
import { signInWithGoogle, signOut, onAuthChange, type User } from '../sync/auth';
import { fullSync, deltaSync } from '../sync/sync';

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
        await get().sync();
      }
    });

    // Delta sync on visibility change
    const handleVisibility = () => {
      const { user, lastSyncAt } = get();
      if (!document.hidden && user && lastSyncAt) {
        deltaSync(user.uid, lastSyncAt).catch(console.error);
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
      if (lastSyncAt) {
        await deltaSync(user.uid, lastSyncAt);
      } else {
        await fullSync(user.uid);
      }
      set({ syncStatus: 'idle', lastSyncAt: Date.now() });
    } catch (err) {
      console.error('Sync error:', err);
      set({ syncStatus: 'error', errorMessage: err instanceof Error ? err.message : '同步失敗' });
    }
  },
}));
