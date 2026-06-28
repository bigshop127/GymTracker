import { db, type Settings } from './schema';

const DEFAULT_SETTINGS: Settings = {
  id: 'global',
  unit: 'kg',
  defaultRestSeconds: 90,
  e1rmFormula: 'epley',
  theme: 'system',
  soundOnRestEnd: true,
  vibrateOnRestEnd: true,
};

/**
 * 取得全域設定。若資料庫中尚無設定，會先寫入預設值並回傳。
 */
export async function getSettings(): Promise<Settings> {
  const settings = await db.settings.get('global');
  if (!settings) {
    await db.settings.put(DEFAULT_SETTINGS);
    return DEFAULT_SETTINGS;
  }
  return settings;
}

/**
 * 儲存/修改全域設定
 */
export async function saveSettings(updates: Partial<Omit<Settings, 'id'>>): Promise<Settings> {
  const current = await getSettings();
  const updatedSettings: Settings = {
    ...current,
    ...updates,
    id: 'global', // 強制固定為 'global'
  };
  await db.settings.put(updatedSettings);
  return updatedSettings;
}
