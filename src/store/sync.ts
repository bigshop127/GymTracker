import { create } from 'zustand';
import { isConfigured } from '../lib/firebase';
import { signInWithGoogle, signOut, onAuthChange, type User } from '../sync/auth';
import { downloadAll, uploadAll, type UploadResult } from '../sync/sync';
import { useActiveWorkoutStore } from './activeWorkout';

type SyncStatus = 'idle' | 'syncing' | 'error';

interface SyncState {
  user: User | null;
  syncStatus: SyncStatus;
  lastUploadAt: number | null;
  lastDownloadAt: number | null;
  errorMessage: string | null;
  isFirebaseConfigured: boolean;

  initAuth: () => () => void;
  signIn: () => Promise<void>;
  reportAuthError: (error: Error) => void;
  signOut: () => Promise<void>;
  upload: () => Promise<UploadResult | void>;
  download: () => Promise<void>;
}

function lastUploadKey(uid: string): string {
  return `gymtracker.lastUploadAt.${uid}`;
}

function lastDownloadKey(uid: string): string {
  return `gymtracker.lastDownloadAt.${uid}`;
}

export const useSyncStore = create<SyncState>((set, get) => ({
  user: null,
  syncStatus: 'idle',
  lastUploadAt: null,
  lastDownloadAt: null,
  errorMessage: null,
  isFirebaseConfigured: isConfigured(),

  // 只負責還原登入狀態，不會自動觸發上傳/下載 —— 同步時機完全交給使用者手動決定。
  initAuth: () => {
    if (!isConfigured()) return () => {};

    const unsub = onAuthChange((user) => {
      set({ user });
      if (user) {
        const storedUpload = localStorage.getItem(lastUploadKey(user.uid));
        const storedDownload = localStorage.getItem(lastDownloadKey(user.uid));
        set({
          lastUploadAt: storedUpload ? parseInt(storedUpload, 10) : null,
          lastDownloadAt: storedDownload ? parseInt(storedDownload, 10) : null,
        });
      } else {
        set({ lastUploadAt: null, lastDownloadAt: null });
      }
    });

    return unsub;
  },

  signIn: async () => {
    try {
      set({ syncStatus: 'syncing', errorMessage: null });
      await signInWithGoogle();
      set({ syncStatus: 'idle' });
    } catch (err) {
      set({ syncStatus: 'error', errorMessage: err instanceof Error ? err.message : '登入失敗' });
    }
  },

  reportAuthError: (error: Error) => {
    set({ syncStatus: 'error', errorMessage: error.message });
  },

  signOut: async () => {
    await signOut();
    set({ user: null, lastUploadAt: null, lastDownloadAt: null });
  },

  upload: async () => {
    const { user } = get();
    if (!user) return;
    try {
      set({ syncStatus: 'syncing', errorMessage: null });
      const result = await uploadAll(user.uid);
      const now = Date.now();
      localStorage.setItem(lastUploadKey(user.uid), now.toString());
      set({ syncStatus: 'idle', lastUploadAt: now });
      return result;
    } catch (err) {
      console.error('Upload error:', err);
      set({ syncStatus: 'error', errorMessage: err instanceof Error ? err.message : '上傳失敗' });
    }
  },

  download: async () => {
    const { user } = get();
    if (!user) return;
    try {
      set({ syncStatus: 'syncing', errorMessage: null });
      const repaired = await downloadAll(user.uid);
      // 修好舊動作 id 後，記憶體中的訓練草稿是舊的，得重讀避免被覆寫回去
      if (repaired > 0) {
        await useActiveWorkoutStore.getState().initActiveWorkout();
      }
      const now = Date.now();
      localStorage.setItem(lastDownloadKey(user.uid), now.toString());
      set({ syncStatus: 'idle', lastDownloadAt: now });
    } catch (err) {
      console.error('Download error:', err);
      set({ syncStatus: 'error', errorMessage: err instanceof Error ? err.message : '下載失敗' });
    }
  },
}));
