import { browserApi } from "./browser";
import { DEFAULT_SETTINGS, mergeSettings, type ExtensionSettings } from "./settings";

const SETTINGS_KEY = "noliaReader.settings";

export async function getSettings(): Promise<ExtensionSettings> {
  const result = await browserApi.storage.sync.get(SETTINGS_KEY);
  return mergeSettings(result[SETTINGS_KEY] as Partial<ExtensionSettings> | undefined);
}

export async function saveSettings(settings: ExtensionSettings): Promise<ExtensionSettings> {
  const merged = mergeSettings(settings);
  await browserApi.storage.sync.set({ [SETTINGS_KEY]: merged });
  return merged;
}

export async function patchSettings(patch: Partial<ExtensionSettings>): Promise<ExtensionSettings> {
  const current = await getSettings();
  return saveSettings(mergeSettings({ ...current, ...patch }));
}

export async function resetSettings(): Promise<ExtensionSettings> {
  await browserApi.storage.sync.set({ [SETTINGS_KEY]: DEFAULT_SETTINGS });
  return DEFAULT_SETTINGS;
}
