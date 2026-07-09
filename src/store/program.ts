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
  advanceCursor: () => Promise<void>;
}

export const useProgramStore = create<ProgramState>((set, get) => ({
  activeProgram: null,
  isLoading: false,

  initProgram: async () => {
    set({ isLoading: true });
    try {
      const active = await getActiveProgram();
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
        cursor: 0,
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
      const updatedProgram: TrainingProgram = {
        ...activeProgram,
        ...updates,
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

  advanceCursor: async () => {
    const { activeProgram } = get();
    if (!activeProgram) return;

    try {
      const nextCursor = (activeProgram.cursor + 1) % activeProgram.slots.length;
      const wrapped = nextCursor === 0;
      const cycleCount = wrapped ? activeProgram.cycleCount + 1 : activeProgram.cycleCount;

      const updatedProgram: TrainingProgram = {
        ...activeProgram,
        cursor: nextCursor,
        cycleCount,
        updatedAt: Date.now(),
      };

      await saveProgram(updatedProgram);
      set({ activeProgram: updatedProgram });
    } catch (error) {
      console.error('Failed to advance program cursor:', error);
    }
  },
}));
