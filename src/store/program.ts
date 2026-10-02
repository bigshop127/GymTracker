import { create } from 'zustand';
import { type TrainingProgram, type ProgramSlot, type Workout } from '../db/schema';
import { getCurrentProgram, saveProgram, listPrograms, restartCurrentProgram, deleteProgram } from '../db/programs';
import { listCompletedWorkouts } from '../db/workouts';
import {
  pauseProgram as pauseProgramPure,
  resumeProgram as resumeProgramPure,
  endProgram as endProgramPure,
  revertSlotForDeletedWorkout,
} from '../lib/programLifecycle';
import { settleLap } from '../lib/programRotation';

interface ProgramState {
  currentProgram: TrainingProgram | null;   // status ∈ {active, paused}，UI 顯示用
  activeProgram: TrainingProgram | null;    // 只有 status === 'active' 才有值；語意跟過去完全一樣
  archivedPrograms: TrainingProgram[];      // 封存清單（completed / abandoned），依 completedAt 新→舊
  isLoading: boolean;
  initProgram: () => Promise<void>;
  createProgram: (
    name: string,
    slots: { label: string; templateId?: string; selfScheduled?: boolean }[],
    estimatedWeeks: { min: number; max: number }
  ) => Promise<void>;
  updateProgram: (updates: Partial<Omit<TrainingProgram, 'id' | 'createdAt' | 'updatedAt'>>) => Promise<void>;
  pause: () => Promise<void>;
  resume: () => Promise<void>;
  restart: () => Promise<void>;
  finish: (reason: 'completed' | 'abandoned') => Promise<void>;
  reactivate: (programId: string) => Promise<void>;
  removeProgram: (programId: string) => Promise<void>;
  completeSlot: (slotId: string) => Promise<void>;
  /** 訓練紀錄被刪掉後呼叫：那筆若是這輪課表的某一格，把進度退回（那格變回還沒練） */
  revertForDeletedWorkout: (workout: Workout) => Promise<void>;
}

async function loadArchivedPrograms(): Promise<TrainingProgram[]> {
  const all = await listPrograms();
  return all
    .filter((p) => p.status === 'completed' || p.status === 'abandoned')
    .sort((a, b) => (b.completedAt ?? b.updatedAt) - (a.completedAt ?? a.updatedAt));
}

export const useProgramStore = create<ProgramState>((set, get) => {
  // 暫停期間，「排課／開訓帶 programId／完訓消耗 slot／7 天輪動」全部都該自動停掉。
  // 分流一次：activeProgram 只有 status === 'active' 才有值，讓既有讀 activeProgram
  // 的程式碼一行都不用改，暫停時自動退化成「沒有計畫」的行為。
  const applyCurrent = (p: TrainingProgram | null) => {
    set({ currentProgram: p, activeProgram: p?.status === 'active' ? p : null });
  };

  return {
    currentProgram: null,
    activeProgram: null,
    archivedPrograms: [],
    isLoading: false,

    initProgram: async () => {
      set({ isLoading: true });
      try {
        let current = await getCurrentProgram();
        // 自我修復：舊資料（尚未跑過 v12 遷移、或被雲端同步的舊格式覆蓋）可能沒有 completedSlotIdsThisLap
        if (current && !Array.isArray(current.completedSlotIdsThisLap)) {
          current = { ...current, completedSlotIdsThisLap: [] };
          await saveProgram(current);
        }
        const archivedPrograms = await loadArchivedPrograms();
        applyCurrent(current);
        set({ archivedPrograms, isLoading: false });
      } catch (error) {
        console.error('Failed to initialize current program:', error);
        set({ isLoading: false });
      }
    },

    createProgram: async (name, slotsInput, estimatedWeeks) => {
      set({ isLoading: true });
      try {
        // 唯一性守衛（saveProgram）會自動把既有的目前計畫（active 或 paused）標成 abandoned
        const now = Date.now();
        const slots: ProgramSlot[] = slotsInput.map((s) => ({
          id: crypto.randomUUID(),
          label: s.label,
          templateId: s.templateId,
          ...(s.selfScheduled ? { selfScheduled: true } : {}),
        }));

        const newProgram: TrainingProgram = {
          id: crypto.randomUUID(),
          name,
          slots,
          completedSlotIdsThisLap: [],
          cycleCount: 0,
          estimatedWeeks,
          status: 'active',
          startedAt: now,
          createdAt: now,
          updatedAt: now,
        };

        await saveProgram(newProgram);
        const archivedPrograms = await loadArchivedPrograms();
        applyCurrent(newProgram);
        set({ archivedPrograms, isLoading: false });
      } catch (error) {
        console.error('Failed to create program:', error);
        set({ isLoading: false });
      }
    },

    updateProgram: async (updates) => {
      const { currentProgram } = get();
      if (!currentProgram) return;

      try {
        const merged: TrainingProgram = { ...currentProgram, ...updates };
        // 刪掉的格子、改成「自行安排」的格子不再算進這輪；輪替格子剛好都練完就進下一輪
        const updatedProgram: TrainingProgram = {
          ...merged,
          ...settleLap(merged),
          updatedAt: Date.now(),
        };
        await saveProgram(updatedProgram);
        applyCurrent(updatedProgram);
      } catch (error) {
        console.error('Failed to update program:', error);
      }
    },

    pause: async () => {
      const { currentProgram } = get();
      if (!currentProgram) return;
      try {
        const updated = pauseProgramPure(currentProgram, Date.now());
        await saveProgram(updated);
        applyCurrent(updated);
      } catch (error) {
        console.error('Failed to pause program:', error);
      }
    },

    resume: async () => {
      const { currentProgram } = get();
      if (!currentProgram) return;
      try {
        const updated = resumeProgramPure(currentProgram, Date.now());
        await saveProgram(updated);
        applyCurrent(updated);
      } catch (error) {
        console.error('Failed to resume program:', error);
      }
    },

    restart: async () => {
      set({ isLoading: true });
      try {
        const { fresh } = await restartCurrentProgram(Date.now());
        const archivedPrograms = await loadArchivedPrograms();
        applyCurrent(fresh);
        set({ archivedPrograms, isLoading: false });
      } catch (error) {
        console.error('Failed to restart program:', error);
        set({ isLoading: false });
      }
    },

    finish: async (reason) => {
      const { currentProgram } = get();
      if (!currentProgram) return;
      try {
        const updated = endProgramPure(currentProgram, Date.now(), reason);
        await saveProgram(updated);
        const archivedPrograms = await loadArchivedPrograms();
        applyCurrent(null);
        set({ archivedPrograms });
      } catch (error) {
        console.error('Failed to finish program:', error);
      }
    },

    reactivate: async (programId) => {
      set({ isLoading: true });
      try {
        const all = await listPrograms();
        const target = all.find((p) => p.id === programId);
        if (!target) {
          set({ isLoading: false });
          return;
        }
        const now = Date.now();
        const reactivated: TrainingProgram = {
          ...target,
          status: 'active',
          completedAt: undefined,
          pausedAt: undefined,
          updatedAt: now,
        };
        // saveProgram 的唯一性守衛會自動把目前的目前計畫（若有）標成 abandoned
        await saveProgram(reactivated);
        const archivedPrograms = await loadArchivedPrograms();
        applyCurrent(reactivated);
        set({ archivedPrograms, isLoading: false });
      } catch (error) {
        console.error('Failed to reactivate program:', error);
        set({ isLoading: false });
      }
    },

    removeProgram: async (programId) => {
      try {
        await deleteProgram(programId);
        if (get().currentProgram?.id === programId) {
          applyCurrent(null);
        }
        const archivedPrograms = await loadArchivedPrograms();
        set({ archivedPrograms });
      } catch (error) {
        console.error('Failed to remove program:', error);
      }
    },

    completeSlot: async (slotId: string) => {
      const { activeProgram } = get();
      if (!activeProgram) return;

      // 驗證 slotId 是否屬於目前的 activeProgram.slots；「自行安排」的格子（腿日）不算進一輪
      const slot = activeProgram.slots.find((s) => s.id === slotId);
      if (!slot || slot.selfScheduled) return;

      try {
        const updatedProgram: TrainingProgram = {
          ...activeProgram,
          ...settleLap({
            ...activeProgram,
            completedSlotIdsThisLap: [...activeProgram.completedSlotIdsThisLap, slotId],
          }),
          updatedAt: Date.now(),
        };

        await saveProgram(updatedProgram);
        applyCurrent(updatedProgram);
      } catch (error) {
        console.error('Failed to complete program slot:', error);
      }
    },

    revertForDeletedWorkout: async (workout: Workout) => {
      // 暫停中的計畫也要退：暫停不影響「那一格其實沒練」這件事
      const current = get().currentProgram ?? (await getCurrentProgram());
      if (!current || current.id !== workout.programId) return;
      try {
        const remaining = await listCompletedWorkouts();
        const reverted = revertSlotForDeletedWorkout(current, workout, remaining, Date.now());
        if (!reverted) return;
        await saveProgram(reverted);
        applyCurrent(reverted);
      } catch (error) {
        console.error('Failed to revert program progress:', error);
      }
    },
  };
});
