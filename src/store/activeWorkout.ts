import { create } from 'zustand';
import { type Workout, type WorkoutEntry, type SetLog, type WorkoutTemplate } from '../db/schema';
import { getActiveWorkout, saveActiveWorkout, deleteWorkout, listCompletedWorkouts } from '../db/workouts';
import { listExercises } from '../db/exercises';
import { getSettings } from '../db/settings';
import { useRestTimerStore } from './restTimer';
import { buildExerciseMap, buildAutoWorkoutTitle } from '../lib/workoutSummary';

interface ActiveWorkoutState {
  activeWorkout: Workout | null;
  isLoading: boolean;

  // 初始化與核心控制
  initActiveWorkout: () => Promise<void>;
  startNewWorkout: (title?: string) => Promise<Workout>;
  cancelWorkout: () => Promise<void>;
  finishWorkout: () => Promise<void>;

  // 修改訓練內容
  addExerciseToWorkout: (exerciseId: string) => Promise<void>;
  removeExerciseFromWorkout: (entryId: string) => Promise<void>;
  addSetToEntry: (entryId: string, initialWeight?: number, initialReps?: number) => Promise<void>;
  removeSetFromEntry: (entryId: string, setId: string) => Promise<void>;
  updateSet: (entryId: string, setId: string, updates: Partial<Omit<SetLog, 'id' | 'createdAt'>>) => Promise<void>;
  updateWorkoutNotes: (notes: string) => Promise<void>;
  updateWorkoutTitle: (title: string) => Promise<void>;
  updateWorkoutLocation: (location: string) => Promise<void>;
  reorderEntries: (entries: WorkoutEntry[]) => Promise<void>;
  updateEntryDefaultRestSeconds: (entryId: string, restSeconds: number | undefined) => Promise<void>;
  startWorkoutFromTemplate: (template: Workout) => Promise<void>;
  startWorkoutFromTemplateEntity: (template: WorkoutTemplate) => Promise<void>;
}

// 用於防抖動 (debounce) 儲存文字輸入的計時器
let debounceTimeout: ReturnType<typeof setTimeout> | null = null;

/**
 * 取消任何待處理的防抖動寫入計時器 (修正 reviews 中的防抖計時器覆蓋問題)
 */
export function cancelPendingSave() {
  if (debounceTimeout) {
    clearTimeout(debounceTimeout);
    debounceTimeout = null;
  }
}

/**
 * 即時儲存目前的訓練草稿，並確保清除任何 pending 的防抖儲存計時器
 */
export function saveWorkoutImmediate(workout: Workout): Promise<void> {
  cancelPendingSave();
  return saveActiveWorkout(workout);
}

/**
 * 防抖動儲存目前的訓練草稿，適用於文字與重量輸入
 */
function saveWorkoutDebounced(workout: Workout) {
  cancelPendingSave(); // 確保只留最新一筆待寫
  debounceTimeout = setTimeout(() => {
    debounceTimeout = null;
    saveActiveWorkout(workout).catch((err) => console.error('Debounced save active workout failed:', err));
  }, 300);
}

/**
 * 當頁面即將關閉或切換時，強制即時寫入目前待處理的變更
 */
export function flushPendingSave() {
  const activeWorkout = useActiveWorkoutStore.getState().activeWorkout;
  if (debounceTimeout && activeWorkout) {
    cancelPendingSave();
    saveActiveWorkout(activeWorkout).catch((err) => console.error('Flush save active workout failed:', err));
  }
}

export const useActiveWorkoutStore = create<ActiveWorkoutState>((set, get) => ({
  activeWorkout: null,
  isLoading: false,

  initActiveWorkout: async () => {
    set({ isLoading: true });
    try {
      const active = await getActiveWorkout();
      set({ activeWorkout: active, isLoading: false });
    } catch (error) {
      console.error('Failed to load active workout:', error);
      set({ isLoading: false });
    }
  },

  startNewWorkout: async (title?: string) => {
    // 防呆機制：若目前已有進行中的草稿，則直接返回，避免重複建立覆蓋
    const existing = get().activeWorkout;
    if (existing) {
      return existing;
    }

    // 取得上一次完成訓練的地點
    let lastLocation = '';
    try {
      const completed = await listCompletedWorkouts();
      const lastWithLoc = completed.find(w => w.location);
      if (lastWithLoc) {
        lastLocation = lastWithLoc.location || '';
      } else {
        // 找不到就帶預設地點的第一個
        const settings = await getSettings();
        if (settings.locations && settings.locations.length > 0) {
          lastLocation = settings.locations[0];
        }
      }
    } catch (e) {
      console.error('Failed to get last workout location:', e);
    }

    const newWorkout: Workout = {
      id: crypto.randomUUID(),
      title: title || '今日訓練',
      startedAt: Date.now(),
      entries: [],
      status: 'active',
      location: lastLocation,
    };
    
    // 即時寫入資料庫
    await saveWorkoutImmediate(newWorkout);
    set({ activeWorkout: newWorkout });
    return newWorkout;
  },

  cancelWorkout: async () => {
    cancelPendingSave(); // 先取消任何待寫計時器，防死而復生
    useRestTimerStore.getState().skipTimer(); // 停止休息計時器
    const { activeWorkout } = get();
    if (activeWorkout) {
      // 自資料庫刪除
      await deleteWorkout(activeWorkout.id);
      set({ activeWorkout: null });
    }
  },

  finishWorkout: async () => {
    cancelPendingSave(); // 先取消任何待寫計時器，防殭屍復活
    useRestTimerStore.getState().skipTimer(); // 停止休息計時器
    const { activeWorkout } = get();
    if (activeWorkout) {
      let title = activeWorkout.title;
      if (!title || title.trim() === '' || title.trim() === '今日訓練') {
        const exercises = await listExercises();
        title = buildAutoWorkoutTitle(activeWorkout, buildExerciseMap(exercises));
      }
      // 直接儲存記憶體中的最新快照，並標記 status 為 completed (防丟資料)
      const finished: Workout = {
        ...activeWorkout,
        title,
        status: 'completed',
        endedAt: Date.now(),
      };
      await saveActiveWorkout(finished);
      set({ activeWorkout: null });
    }
  },

  addExerciseToWorkout: async (exerciseId: string) => {
    const { activeWorkout } = get();
    if (!activeWorkout) return;

    const newEntry: WorkoutEntry = {
      id: crypto.randomUUID(),
      exerciseId,
      order: activeWorkout.entries.length,
      sets: [],
    };

    // 建立預設的第一組
    const firstSet: SetLog = {
      id: crypto.randomUUID(),
      weight: 0,
      reps: 0,
      isWarmup: false,
      completed: false,
      createdAt: Date.now(),
    };
    newEntry.sets.push(firstSet);

    const updatedWorkout: Workout = {
      ...activeWorkout,
      entries: [...activeWorkout.entries, newEntry],
    };

    // 即時存入 DB
    await saveWorkoutImmediate(updatedWorkout);
    set({ activeWorkout: updatedWorkout });
  },

  removeExerciseFromWorkout: async (entryId: string) => {
    const { activeWorkout } = get();
    if (!activeWorkout) return;

    const updatedEntries = activeWorkout.entries
      .filter((entry) => entry.id !== entryId)
      .map((entry, idx) => ({ ...entry, order: idx })); // 重新排列 order

    const updatedWorkout: Workout = {
      ...activeWorkout,
      entries: updatedEntries,
    };

    // 即時存入 DB
    await saveWorkoutImmediate(updatedWorkout);
    set({ activeWorkout: updatedWorkout });
  },

  addSetToEntry: async (entryId: string, initialWeight?: number, initialReps?: number) => {
    const { activeWorkout } = get();
    if (!activeWorkout) return;

    const updatedEntries = activeWorkout.entries.map((entry) => {
      if (entry.id !== entryId) return entry;

      // 預設參考前一組的數值
      let weight = initialWeight ?? 0;
      let reps = initialReps ?? 0;
      if (entry.sets.length > 0 && initialWeight === undefined && initialReps === undefined) {
        const lastSet = entry.sets[entry.sets.length - 1];
        weight = lastSet.weight;
        reps = lastSet.reps;
      }

      const newSet: SetLog = {
        id: crypto.randomUUID(),
        weight,
        reps,
        isWarmup: false,
        completed: false,
        createdAt: Date.now(),
      };

      return {
        ...entry,
        sets: [...entry.sets, newSet],
      };
    });

    const updatedWorkout: Workout = {
      ...activeWorkout,
      entries: updatedEntries,
    };

    // 即時存入 DB
    await saveWorkoutImmediate(updatedWorkout);
    set({ activeWorkout: updatedWorkout });
  },

  removeSetFromEntry: async (entryId: string, setId: string) => {
    const { activeWorkout } = get();
    if (!activeWorkout) return;

    const updatedEntries = activeWorkout.entries.map((entry) => {
      if (entry.id !== entryId) return entry;
      return {
        ...entry,
        sets: entry.sets.filter((set) => set.id !== setId),
      };
    });

    const updatedWorkout: Workout = {
      ...activeWorkout,
      entries: updatedEntries,
    };

    // 即時存入 DB
    await saveWorkoutImmediate(updatedWorkout);
    set({ activeWorkout: updatedWorkout });
  },

  updateSet: async (entryId: string, setId: string, updates: Partial<Omit<SetLog, 'id' | 'createdAt'>>) => {
    const { activeWorkout } = get();
    if (!activeWorkout) return;

    const updatedEntries = activeWorkout.entries.map((entry) => {
      if (entry.id !== entryId) return entry;
      return {
        ...entry,
        sets: entry.sets.map((setLog) => {
          if (setLog.id !== setId) return setLog;
          return {
            ...setLog,
            ...updates,
          };
        }),
      };
    });

    const updatedWorkout: Workout = {
      ...activeWorkout,
      entries: updatedEntries,
    };

    // 若是「打勾」或「修改 Warmup」，我們即時寫入以觸發 UI 動態
    // 若僅是重量/次數輸入，則使用 debounce 以免頻繁寫入資料庫
    const isImmediate = 'completed' in updates || 'isWarmup' in updates;
    if (isImmediate) {
      await saveWorkoutImmediate(updatedWorkout);
    } else {
      saveWorkoutDebounced(updatedWorkout);
    }

    set({ activeWorkout: updatedWorkout });
  },

  updateWorkoutNotes: async (notes: string) => {
    const { activeWorkout } = get();
    if (!activeWorkout) return;

    const updatedWorkout: Workout = {
      ...activeWorkout,
      notes,
    };

    // 筆記輸入通常是連續輸入，使用 debounce 儲存
    saveWorkoutDebounced(updatedWorkout);
    set({ activeWorkout: updatedWorkout });
  },

  updateWorkoutTitle: async (title: string) => {
    const { activeWorkout } = get();
    if (!activeWorkout) return;

    const updatedWorkout: Workout = {
      ...activeWorkout,
      title,
    };

    // 標題通常是連續輸入，使用 debounce 儲存
    saveWorkoutDebounced(updatedWorkout);
    set({ activeWorkout: updatedWorkout });
  },

  updateWorkoutLocation: async (location: string) => {
    const { activeWorkout } = get();
    if (!activeWorkout) return;

    const updatedWorkout: Workout = {
      ...activeWorkout,
      location,
    };

    // 訓練地點變更即時寫入 DB，不進行 debounce
    await saveWorkoutImmediate(updatedWorkout);
    set({ activeWorkout: updatedWorkout });
  },

  reorderEntries: async (entries: WorkoutEntry[]) => {
    const { activeWorkout } = get();
    if (!activeWorkout) return;

    const updatedWorkout: Workout = {
      ...activeWorkout,
      entries: entries.map((entry, idx) => ({ ...entry, order: idx })),
    };

    // 排序完成，即時寫入 DB
    await saveWorkoutImmediate(updatedWorkout);
    set({ activeWorkout: updatedWorkout });
  },

  updateEntryDefaultRestSeconds: async (entryId: string, restSeconds: number | undefined) => {
    const { activeWorkout } = get();
    if (!activeWorkout) return;

    const updatedEntries = activeWorkout.entries.map((entry) => {
      if (entry.id !== entryId) return entry;
      return {
        ...entry,
        defaultRestSeconds: restSeconds,
      };
    });

    const updatedWorkout: Workout = {
      ...activeWorkout,
      entries: updatedEntries,
    };

    await saveWorkoutImmediate(updatedWorkout);
    set({ activeWorkout: updatedWorkout });
  },

  startWorkoutFromTemplate: async (template: Workout) => {
    // 防禦性檢查：若當前已有進行中的訓練，不允許套用範本新建
    const existing = get().activeWorkout;
    if (existing) {
      throw new Error('ACTIVE_WORKOUT_EXISTS');
    }

    cancelPendingSave();
    useRestTimerStore.getState().skipTimer();

    // 去掉既有的「 (範本)」結尾，避免重用範本時標題無限疊加（用 regex 免去數字元的 off-by-N）
    const baseTitle = (template.title || '今日訓練').replace(/ \(範本\)$/, '');

    const newWorkout: Workout = {
      id: crypto.randomUUID(),
      title: `${baseTitle} (範本)`,
      startedAt: Date.now(),
      status: 'active',
      entries: template.entries.map((entry) => ({
        id: crypto.randomUUID(),
        exerciseId: entry.exerciseId,
        order: entry.order,
        defaultRestSeconds: entry.defaultRestSeconds,
        sets: entry.sets.map((setLog) => ({
          id: crypto.randomUUID(),
          weight: 0,
          reps: 0,
          isWarmup: setLog.isWarmup,
          completed: false,
          createdAt: Date.now(),
        })),
      })),
    };

    await saveWorkoutImmediate(newWorkout);
    set({ activeWorkout: newWorkout });
  },

  startWorkoutFromTemplateEntity: async (template: WorkoutTemplate) => {
    // 防禦性檢查：若當前已有進行中的訓練，不允許套用範本新建
    const existing = get().activeWorkout;
    if (existing) {
      throw new Error('ACTIVE_WORKOUT_EXISTS');
    }

    cancelPendingSave();
    useRestTimerStore.getState().skipTimer();

    const newWorkout: Workout = {
      id: crypto.randomUUID(),
      title: template.name,
      startedAt: Date.now(),
      status: 'active',
      location: template.location,
      entries: template.entries.map((entry) => ({
        id: crypto.randomUUID(),
        exerciseId: entry.exerciseId,
        order: entry.order,
        defaultRestSeconds: entry.defaultRestSeconds,
        sets: entry.sets.map((setLog) => ({
          id: crypto.randomUUID(),
          weight: setLog.weight,
          reps: setLog.reps,
          isWarmup: setLog.isWarmup,
          completed: false,
          createdAt: Date.now(),
        })),
      })),
    };

    await saveWorkoutImmediate(newWorkout);
    set({ activeWorkout: newWorkout });
  },
}));
