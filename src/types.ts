export interface CommitInfo {
  hash: string;
  shortHash: string;
  message: string;
  author: string;
  date: string;
  branch: string;
  filesChanged: number;
  insertions: number;
  deletions: number;
}

export interface Finding {
  file: string;
  line: number;
  severity: "bug" | "risk" | "nit";
  title: string;
  detail: string;
}

export interface FileOverview {
  file: string;
  overview: string;
}

export interface Review {
  commit: CommitInfo;
  summary: string;
  keyChanges: string[];
  confidence: number;
  confidenceReason: string;
  riskAssessment: string;
  findings: Finding[];
  filesOverview: FileOverview[];
  suggestedReviewers: string[];
  breakingChanges: boolean;
  breakingChangeDetails: string | null;
  timestamp: string;
  reviewScope: ReviewScope;
  model: string;
}

export type ReviewScope = "staged" | "file";

export const OPENDIFFS_DIR = ".opendiffs";
export const REVIEWS_DIR = "reviews";
export const PROMPT_FILE = "prompt.md";
export const CONFIG_FILE = "config.json";

export interface Config {
  providers: string[];
  saveReports: "always" | "staged-only" | "never";
  maxReports: number;
}

export const DEFAULT_CONFIG: Config = {
  providers: ["claude"],
  saveReports: "always",
  maxReports: 50,
};
