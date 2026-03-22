import pc from "picocolors";
import { Review, Finding } from "./types";

const SEVERITY_ICONS: Record<string, string> = {
  bug: pc.red("■"),
  risk: pc.yellow("▲"),
  nit: pc.gray("●"),
};

const SEVERITY_LABELS: Record<string, (s: string) => string> = {
  bug: pc.red,
  risk: pc.yellow,
  nit: pc.gray,
};

export function formatReview(review: Review): string {
  const lines: string[] = [];
  const { commit, findings } = review;

  // Header
  lines.push("");
  lines.push(
    `  ${pc.bold(commit.message)}  ${pc.dim("·")}  ${pc.dim(commit.branch)}  ${pc.dim("·")}  ${pc.dim(`${commit.filesChanged} files`)}  ${pc.dim(`(+${commit.insertions}/-${commit.deletions})`)}`
  );
  lines.push("");

  // Score
  const score = review.confidence;
  const scoreColor = score >= 8 ? pc.green : score >= 5 ? pc.yellow : pc.red;
  const verdict =
    score >= 8
      ? "Good to commit"
      : score >= 5
        ? "Review before committing"
        : "Issues to fix";
  lines.push(`  ${scoreColor(pc.bold(`Score: ${score}/10`))}  ${pc.dim("—")}  ${verdict}`);
  lines.push("");

  // Summary
  lines.push(`  ${pc.bold("Summary")}`);
  lines.push(`  ${review.summary}`);
  lines.push("");

  // Key changes
  if (review.keyChanges.length > 0) {
    lines.push(`  ${pc.bold("Key Changes")}`);
    for (const change of review.keyChanges) {
      lines.push(`  ${pc.dim("•")} ${change}`);
    }
    lines.push("");
  }

  // Risk assessment
  lines.push(`  ${pc.bold("Risk Assessment")}`);
  lines.push(`  ${review.riskAssessment}`);
  lines.push("");

  // Breaking changes
  if (review.breakingChanges) {
    lines.push(`  ${pc.red(pc.bold("⚠ Breaking Changes"))}`);
    lines.push(`  ${review.breakingChangeDetails || "Breaking changes detected."}`);
    lines.push("");
  }

  // Findings
  const bugs = findings.filter((f) => f.severity === "bug").length;
  const risks = findings.filter((f) => f.severity === "risk").length;
  const nits = findings.filter((f) => f.severity === "nit").length;

  const countParts: string[] = [];
  if (bugs > 0) countParts.push(pc.red(`${bugs} bug${bugs !== 1 ? "s" : ""}`));
  if (risks > 0) countParts.push(pc.yellow(`${risks} risk${risks !== 1 ? "s" : ""}`));
  if (nits > 0) countParts.push(pc.gray(`${nits} nit${nits !== 1 ? "s" : ""}`));

  const countLabel = countParts.length > 0 ? `  ${pc.dim("(")}${countParts.join(pc.dim(", "))}${pc.dim(")")}` : "";
  lines.push(`  ${pc.bold("Findings")}${countLabel}`);

  if (findings.length === 0) {
    lines.push(`  ${pc.green("No issues found. Looks good!")}`);
  } else {
    const sorted = [...findings].sort((a, b) => {
      const order: Record<string, number> = { bug: 0, risk: 1, nit: 2 };
      return (order[a.severity] ?? 3) - (order[b.severity] ?? 3);
    });

    for (const f of sorted) {
      const icon = SEVERITY_ICONS[f.severity] || "·";
      const label = (SEVERITY_LABELS[f.severity] || pc.gray)(f.severity);
      lines.push("");
      lines.push(`  ${icon} ${label}  ${pc.dim(`${f.file}${f.line ? `:${f.line}` : ""}`)}`);
      lines.push(`    ${pc.bold(f.title)}`);
      lines.push(`    ${pc.dim(f.detail)}`);
    }
  }
  lines.push("");

  // Files overview
  if (review.filesOverview.length > 0) {
    lines.push(`  ${pc.bold("Files")}`);
    const maxLen = Math.max(...review.filesOverview.map((f) => f.file.length));
    for (const f of review.filesOverview) {
      lines.push(`  ${pc.cyan(f.file.padEnd(maxLen + 2))}${pc.dim(f.overview)}`);
    }
    lines.push("");
  }

  // Suggested reviewers
  if (review.suggestedReviewers.length > 0) {
    lines.push(`  ${pc.bold("Suggested Reviewers")}`);
    for (const r of review.suggestedReviewers) {
      lines.push(`  ${pc.dim("→")} ${r}`);
    }
    lines.push("");
  }

  return lines.join("\n");
}

export function formatScore(score: number): string {
  const color = score >= 8 ? pc.green : score >= 5 ? pc.yellow : pc.red;
  return color(pc.bold(`${score}/10`));
}
