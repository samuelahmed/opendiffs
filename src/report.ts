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

function confidenceLabel(score: number): string {
  if (score >= 8) return "Safe to merge";
  if (score >= 6) return "Safe with minor awareness";
  if (score >= 5) return "Discuss before merging";
  if (score >= 3) return "Significant concerns";
  return "Do not merge";
}

export function generateMarkdown(review: Review): string {
  const { commit, findings } = review;
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

  let md = `# ${commit.message}

| | |
|---|---|
| **Commit** | \`${commit.shortHash}\` |
| **Branch** | \`${commit.branch}\` |
| **Author** | ${commit.author} |
| **Date** | ${date} |
| **Scope** | ${review.reviewScope} |
| **Model** | ${review.model} |
| **Files changed** | ${commit.filesChanged} (+${commit.insertions} / -${commit.deletions}) |

---

## Summary

${review.summary}

## Confidence Score: ${review.confidence}/10

**${confidenceLabel(review.confidence)}**

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

  if (review.suggestedReviewers.length > 0) {
    md += `
## Suggested Reviewers

${review.suggestedReviewers.map((r) => `- ${r}`).join("\n")}
`;
  }

  md += `
---
*Reviewed by OpenDiffs on ${date}*
`;

  return md;
}

export function saveReport(review: Review, workspaceRoot: string): string {
  const branchDir = review.commit.branch.replace(/\//g, path.sep);
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
  const slug = slugify(review.commit.message);
  const modelSlug = review.model && review.model !== "default" ? `_${slugify(review.model)}` : "";
  const filename = `${dateStr}_${timeStr}_${slug}${modelSlug}.md`;

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

function collectMdFiles(dir: string, results: { path: string; mtime: number }[]) {
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
