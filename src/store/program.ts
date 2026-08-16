import { create } from 'zustand';
import { type TrainingProgram, type ProgramSlot } from '../db/schema';
import { getActiveProgram, saveProgram } from '../db/programs';

interface ProgramState {
  activeProgram: TrainingProgram | null;
  isLoading: boolean;
  initProgram: () => Promise<void>;
  createProgram: (
    name: string,
    slots: { label: string; templateId?: string }[],
    estimatedWeeks: { min: number; max: number }
  ) => Promise<void>;
  updateProgram: (updates: Partial<Omit<TrainingProgram, 'id' | 'createdAt' | 'updatedAt'>>) => Promise<void>;
  endProgram: () => Promise<void>;
  completeSlot: (slotId: string) => Promise<void>;
}

export const useProgramStore = create<ProgramState>((set, get) => ({
  activeProgram: null,
  isLoading: false,

  initProgram: async () => {
    set({ isLoading: true });
    try {
      let active = await getActiveProgram();
      // 自我修復：舊資料（尚未跑過 v12 遷移、或被雲端同步的舊格式覆蓋）可能沒有 completedSlotIdsThisLap
      if (active && !Array.isArray(active.completedSlotIdsThisLap)) {
        active = { ...active, completedSlotIdsThisLap: [] };
        await saveProgram(active);
      }
      set({ activeProgram: active, isLoading: false });
    } catch (error) {
      console.error('Failed to initialize active program:', error);
      set({ isLoading: false });
    }
  },

  createProgram: async (name, slotsInput, estimatedWeeks) => {
    set({ isLoading: true });
    try {
      // 1. Ensure no other active program exists by ending it
      const currentActive = await getActiveProgram();
      if (currentActive) {
        currentActive.status = 'completed';
        currentActive.completedAt = Date.now();
        await saveProgram(currentActive);
      }

      // 2. Create new active program
      const now = Date.now();
      const slots: ProgramSlot[] = slotsInput.map((s) => ({
        id: crypto.randomUUID(),
        label: s.label,
        templateId: s.templateId,
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
      set({ activeProgram: newProgram, isLoading: false });
    } catch (error) {
      console.error('Failed to create program:', error);
      set({ isLoading: false });
    }
  },

  updateProgram: async (updates) => {
    const { activeProgram } = get();
    if (!activeProgram) return;

    try {
      let completedSlotIdsThisLap = activeProgram.completedSlotIdsThisLap;
      if (updates.slots) {
        const validIds = new Set(updates.slots.map(s => s.id));
        completedSlotIdsThisLap = completedSlotIdsThisLap.filter(id => validIds.has(id));
      }

      const updatedProgram: TrainingProgram = {
        ...activeProgram,
        ...updates,
        completedSlotIdsThisLap,
        updatedAt: Date.now(),
      };
      await saveProgram(updatedProgram);
      set({ activeProgram: updatedProgram });
    } catch (error) {
      console.error('Failed to update program:', error);
    }
  },

  endProgram: async () => {
    const { activeProgram } = get();
    if (!activeProgram) return;

    try {
      const updatedProgram: TrainingProgram = {
        ...activeProgram,
        status: 'completed',
        completedAt: Date.now(),
        updatedAt: Date.now(),
      };
      await saveProgram(updatedProgram);
      set({ activeProgram: null });
    } catch (error) {
      console.error('Failed to end program:', error);
    }
  },

  completeSlot: async (slotId: string) => {
    const { activeProgram } = get();
    if (!activeProgram) return;

    // 驗證 slotId 是否屬於目前的 activeProgram.slots
    const slotExists = activeProgram.slots.some((s) => s.id === slotId);
    if (!slotExists) return;

    try {
      const already = activeProgram.completedSlotIdsThisLap.includes(slotId);
      let completed = already
        ? activeProgram.completedSlotIdsThisLap
        : [...activeProgram.completedSlotIdsThisLap, slotId];
      let cycleCount = activeProgram.cycleCount;
      if (completed.length >= activeProgram.slots.length) {
        cycleCount += 1;
        completed = [];
      }

      const updatedProgram: TrainingProgram = {
        ...activeProgram,
        completedSlotIdsThisLap: completed,
        cycleCount,
        updatedAt: Date.now(),
      };

      await saveProgram(updatedProgram);
      set({ activeProgram: updatedProgram });
    } catch (error) {
      console.error('Failed to complete program slot:', error);
    }
  },
}));
