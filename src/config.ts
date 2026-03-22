import * as fs from "fs";
import * as path from "path";
import { Config, DEFAULT_CONFIG, OPENDIFFS_DIR, CONFIG_FILE, PROMPT_FILE, REVIEWS_DIR } from "./types";

/** Get the .opendiffs directory path for a project */
export function getOpenDiffsDir(cwd: string): string {
  return path.join(cwd, OPENDIFFS_DIR);
}

/** Get the reviews directory path */
export function getReviewsDir(cwd: string): string {
  return path.join(cwd, OPENDIFFS_DIR, REVIEWS_DIR);
}

/** Get the prompt file path */
export function getPromptPath(cwd: string): string {
  return path.join(cwd, OPENDIFFS_DIR, PROMPT_FILE);
}

/** Get the config file path */
export function getConfigPath(cwd: string): string {
  return path.join(cwd, OPENDIFFS_DIR, CONFIG_FILE);
}

export function loadConfig(cwd: string): Config {
  const configPath = getConfigPath(cwd);
  if (!fs.existsSync(configPath)) return { ...DEFAULT_CONFIG };

  try {
    const raw = fs.readFileSync(configPath, "utf-8");
    const parsed = JSON.parse(raw);
    const merged = { ...DEFAULT_CONFIG, ...parsed };
    if (!Array.isArray(merged.providers)) {
      merged.providers = DEFAULT_CONFIG.providers;
    }
    return merged;
  } catch {
    return { ...DEFAULT_CONFIG };
  }
}

export function saveConfig(cwd: string, config: Partial<Config>): string {
  const dir = getOpenDiffsDir(cwd);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  const configPath = getConfigPath(cwd);
  let existing: Record<string, unknown> = {};

  if (fs.existsSync(configPath)) {
    try {
      existing = JSON.parse(fs.readFileSync(configPath, "utf-8"));
    } catch {}
  }

  const merged = { ...existing, ...config };
  fs.writeFileSync(configPath, JSON.stringify(merged, null, 2) + "\n", "utf-8");
  return configPath;
}

/** Read the custom prompt file if it exists, otherwise return empty string */
export function loadCustomPrompt(cwd: string): string {
  const promptPath = getPromptPath(cwd);
  if (!fs.existsSync(promptPath)) return "";
  try {
    return fs.readFileSync(promptPath, "utf-8");
  } catch {
    return "";
  }
}
