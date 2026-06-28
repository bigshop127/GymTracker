import { create } from 'zustand';
import { type Settings } from '../db/schema';
import { getSettings, saveSettings } from '../db/settings';

interface SettingsState {
  settings: Settings | null;
  isLoading: boolean;
  initSettings: () => Promise<void>;
  updateSettings: (updates: Partial<Omit<Settings, 'id'>>) => Promise<void>;
}

export const useSettingsStore = create<SettingsState>((set) => ({
  settings: null,
  isLoading: false,

  initSettings: async () => {
    set({ isLoading: true });
    try {
      const currentSettings = await getSettings();
      set({ settings: currentSettings, isLoading: false });
    } catch (error) {
      console.error('Failed to initialize settings:', error);
      set({ isLoading: false });
    }
  },

  updateSettings: async (updates: Partial<Omit<Settings, 'id'>>) => {
    try {
      const updated = await saveSettings(updates);
      set({ settings: updated });
    } catch (error) {
      console.error('Failed to update settings:', error);
    }
  },
}));
