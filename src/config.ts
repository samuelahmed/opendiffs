import * as fs from "fs";
import * as path from "path";
import { Config, DEFAULT_CONFIG, OPENDIFFS_DIR, CONFIG_FILE, PROMPT_FILE, REVIEWS_DIR } from "./types.js";

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
    addToGitignore(cwd);
  }

  const configPath = getConfigPath(cwd);
  let existing: Record<string, unknown> = {};

  if (fs.existsSync(configPath)) {
    try {
      existing = JSON.parse(fs.readFileSync(configPath, "utf-8"));
    } catch {
      // Existing config is corrupt — overwrite it entirely
      existing = {};
    }
  }

  const merged = { ...existing, ...config };
  fs.writeFileSync(configPath, JSON.stringify(merged, null, 2) + "\n", "utf-8");
  return configPath;
}

export function addToGitignore(cwd: string): void {
  const gitRoot = findGitRoot(cwd);
  if (!gitRoot) return;

  const relativePath = gitRoot === cwd
    ? OPENDIFFS_DIR
    : path.relative(gitRoot, path.join(cwd, OPENDIFFS_DIR));
  const ignoreEntry = relativePath.replace(/\\/g, "/");

  const gitignorePath = path.join(gitRoot, ".gitignore");
  let content = "";
  if (fs.existsSync(gitignorePath)) {
    content = fs.readFileSync(gitignorePath, "utf-8");
    const lines = content.split("\n").map((l) => l.trim());
    if (lines.includes(ignoreEntry) || lines.includes(ignoreEntry + "/")) return;
  }

  const entry = content.length > 0 && !content.endsWith("\n") ? `\n${ignoreEntry}\n` : `${ignoreEntry}\n`;
  fs.appendFileSync(gitignorePath, entry, "utf-8");
}

function findGitRoot(from: string): string | null {
  let dir = path.resolve(from);
  while (true) {
    if (fs.existsSync(path.join(dir, ".git"))) return dir;
    const parent = path.dirname(dir);
    if (parent === dir) return null;
    dir = parent;
  }
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
