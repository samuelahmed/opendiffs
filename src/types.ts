export interface ChangeContext {
  label: string;
  author: string;
  date: string;
  branch: string;
  filesChanged: number;
  insertions: number;
  deletions: number;
}

export type ReviewScope = "staged" | "file";

export const VALID_PROVIDERS = ["claude", "codex"] as const;

export const OPENDIFFS_DIR = ".opendiffs";
export const REVIEWS_DIR = "reviews";
export const PROMPT_FILE = "prompt.md";
export const CONFIG_FILE = "config.json";

export interface Config {
  providers: string[];
  saveReviews: "always" | "staged-only" | "never";
  maxReviews: number;
}

export const DEFAULT_CONFIG: Config = {
  providers: ["claude"],
  saveReviews: "always",
  maxReviews: 50,
};
