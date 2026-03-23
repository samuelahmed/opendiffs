import * as path from "path";
import * as fs from "fs";
import { ChangeContext } from "./types.js";
import { getOpenDiffsDir, getReviewsDir, addToGitignore } from "./config.js";

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 50);
}

export function saveReview(
  markdown: string,
  changeInfo: ChangeContext,
  provider: string,
  workspaceRoot: string,
): string {
  const branchDir = changeInfo.branch.replace(/\//g, path.sep);
  const openDiffsDir = getOpenDiffsDir(workspaceRoot);
  const firstTime = !fs.existsSync(openDiffsDir);
  const dir = path.join(getReviewsDir(workspaceRoot), branchDir);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  if (firstTime) {
    addToGitignore(workspaceRoot);
  }

  const ts = new Date();
  const dateStr = ts.toISOString().slice(0, 10);
  const timeStr = ts.toISOString().slice(11, 19).replace(/:/g, "");
  const slug = slugify(changeInfo.label);
  const providerSlug = provider ? `_${slugify(provider)}` : "";
  const filename = `${dateStr}_${timeStr}_${slug}${providerSlug}.md`;

  const filePath = path.join(dir, filename);
  fs.writeFileSync(filePath, markdown, "utf-8");
  return filePath;
}

export function pruneReviews(workspaceRoot: string, maxReviews: number = 50) {
  const dir = getReviewsDir(workspaceRoot);
  if (!fs.existsSync(dir)) return;

  const allFiles: { path: string; mtime: number }[] = [];
  collectMdFiles(dir, allFiles);

  if (allFiles.length <= maxReviews) return;

  allFiles.sort((a, b) => a.mtime - b.mtime);
  const toDelete = allFiles.slice(0, allFiles.length - maxReviews);
  for (const file of toDelete) {
    fs.unlinkSync(file.path);
  }

  cleanEmptyDirs(dir);
}

export function collectMdFiles(dir: string, results: { path: string; mtime: number }[]) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      collectMdFiles(full, results);
    } else if (entry.name.endsWith(".md")) {
      results.push({ path: full, mtime: fs.statSync(full).mtimeMs });
    }
  }
}

function cleanEmptyDirs(dir: string) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      const full = path.join(dir, entry.name);
      cleanEmptyDirs(full);
      if (fs.readdirSync(full).length === 0) {
        fs.rmdirSync(full);
      }
    }
  }
}
