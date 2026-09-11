import fs from "fs";
import fsp from "fs/promises";
import path from "path";

const SETTINGS_PATH = path.join(process.cwd(), ".data", "settings.json");

/** App settings file — reserved for future local prefs. */
export type AppSettings = Record<string, never>;

function parseSettings(raw: string): AppSettings {
  try {
    JSON.parse(raw);
    return {};
  } catch {
    return {};
  }
}

export function loadAppSettingsSync(): AppSettings {
  try {
    return parseSettings(fs.readFileSync(SETTINGS_PATH, "utf8"));
  } catch {
    return {};
  }
}

export async function loadAppSettings(): Promise<AppSettings> {
  try {
    return parseSettings(await fsp.readFile(SETTINGS_PATH, "utf8"));
  } catch {
    return {};
  }
}

export async function saveAppSettings(_patch: AppSettings = {}): Promise<AppSettings> {
  const next: AppSettings = {};
  await fsp.mkdir(path.dirname(SETTINGS_PATH), { recursive: true });
  await fsp.writeFile(SETTINGS_PATH, JSON.stringify(next, null, 2), "utf8");
  return next;
}
