import * as path from "path";
import * as fs from "fs";
import { Review } from "./types";
import { getReviewsDir, addToGitignore } from "./config";

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 50);
}

export function generateMarkdown(review: Review): string {
  const { change, findings } = review;
  const date = new Date(review.timestamp).toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });

  const bugs = findings.filter((f) => f.severity === "bug").length;
  const risks = findings.filter((f) => f.severity === "risk").length;
  const nits = findings.filter((f) => f.severity === "nit").length;

  let md = `# ${change.label}

| | |
|---|---|
| **Branch** | \`${change.branch}\` |
| **Author** | ${change.author} |
| **Date** | ${date} |
| **Scope** | ${review.reviewScope} |
| **Provider** | ${review.provider} |
| **Files changed** | ${change.filesChanged} (+${change.insertions} / -${change.deletions}) |

---

## Summary

${review.summary}

## Confidence Score: ${review.confidence}/10

${review.confidenceReason}

## Key Changes

${review.keyChanges.map((c) => `- ${c}`).join("\n")}

## Risk Assessment

${review.riskAssessment}
`;

  if (review.breakingChanges) {
    md += `
## Breaking Changes

${review.breakingChangeDetails || "Breaking changes detected — review carefully."}
`;
  }

  if (findings.length > 0) {
    md += `
## Findings

| Severity | File | Line | Issue |
|----------|------|------|-------|
${findings
  .map(
    (f) =>
      `| ${f.severity.toUpperCase()} | \`${f.file}\` | ${f.line || "-"} | **${f.title}**: ${f.detail} |`
  )
  .join("\n")}

**Summary**: ${bugs} bug${bugs !== 1 ? "s" : ""}, ${risks} risk${risks !== 1 ? "s" : ""}, ${nits} nit${nits !== 1 ? "s" : ""}
`;
  } else {
    md += `
## Findings

No issues found.
`;
  }

  md += `
## Files Changed

| File | Overview |
|------|----------|
${review.filesOverview.map((f) => `| \`${f.file}\` | ${f.overview} |`).join("\n")}
`;

  md += `
---
*Reviewed by OpenDiffs on ${date}*
`;

  return md;
}

export function saveReport(review: Review, workspaceRoot: string): string {
  const branchDir = review.change.branch.replace(/\//g, path.sep);
  const openDiffsDir = path.join(workspaceRoot, ".opendiffs");
  const firstTime = !fs.existsSync(openDiffsDir);
  const dir = path.join(getReviewsDir(workspaceRoot), branchDir);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  if (firstTime) {
    addToGitignore(workspaceRoot);
  }

  const ts = new Date(review.timestamp);
  const dateStr = ts.toISOString().slice(0, 10);
  const timeStr = ts.toISOString().slice(11, 19).replace(/:/g, "");
  const slug = slugify(review.change.label);
  const providerSlug = review.provider && review.provider !== "default" ? `_${slugify(review.provider)}` : "";
  const filename = `${dateStr}_${timeStr}_${slug}${providerSlug}.md`;

  const filePath = path.join(dir, filename);
  fs.writeFileSync(filePath, generateMarkdown(review), "utf-8");
  return filePath;
}

export function pruneReports(workspaceRoot: string, maxReports: number = 50) {
  const dir = getReviewsDir(workspaceRoot);
  if (!fs.existsSync(dir)) return;

  const allFiles: { path: string; mtime: number }[] = [];
  collectMdFiles(dir, allFiles);

  if (allFiles.length <= maxReports) return;

  allFiles.sort((a, b) => a.mtime - b.mtime);
  const toDelete = allFiles.slice(0, allFiles.length - maxReports);
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
