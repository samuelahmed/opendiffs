import { describe, it } from "node:test";
import * as assert from "node:assert/strict";
import { generateMarkdown } from "./report";
import { Review } from "./types";

function makeReview(overrides: Partial<Review> = {}): Review {
  return {
    change: {
      label: "Staged changes",
      author: "Alice",
      date: "2026-01-15T10:00:00.000Z",
      branch: "main",
      filesChanged: 2,
      insertions: 30,
      deletions: 5,
    },
    summary: "Added auth middleware",
    keyChanges: ["New auth check on /api routes", "Token refresh on 401"],
    confidence: 8,
    confidenceReason: "Verified callers and tests",
    riskAssessment: "Low risk",
    findings: [],
    filesOverview: [{ file: "src/auth.ts", overview: "New middleware" }],
    breakingChanges: false,
    breakingChangeDetails: null,
    timestamp: "2026-01-15T10:00:00.000Z",
    reviewScope: "staged",
    provider: "claude",
    ...overrides,
  };
}

describe("generateMarkdown", () => {
  it("includes all review sections", () => {
    const md = generateMarkdown(makeReview());

    assert.ok(md.includes("# Staged changes"));
    assert.ok(md.includes("**Branch** | `main`"));
    assert.ok(md.includes("**Author** | Alice"));
    assert.ok(md.includes("## Summary"));
    assert.ok(md.includes("Added auth middleware"));
    assert.ok(md.includes("## Confidence Score: 8/10"));
    assert.ok(md.includes("## Key Changes"));
    assert.ok(md.includes("- New auth check on /api routes"));
    assert.ok(md.includes("## Risk Assessment"));
    assert.ok(md.includes("## Files Changed"));
    assert.ok(md.includes("`src/auth.ts`"));
  });

  it("includes findings table when findings exist", () => {
    const md = generateMarkdown(makeReview({
      findings: [
        { file: "src/auth.ts", line: 42, severity: "bug", title: "Null access", detail: "token can be undefined" },
        { file: "src/api.ts", severity: "nit", title: "Unused import", detail: "Remove it" },
      ],
    }));

    assert.ok(md.includes("| BUG |"));
    assert.ok(md.includes("| NIT |"));
    assert.ok(md.includes("`src/auth.ts`"));
    assert.ok(md.includes("| 42 |"));
    assert.ok(md.includes("| - |")); // no line number
    assert.ok(md.includes("1 bug, 1 risk, 1 nit") === false);
    assert.ok(md.includes("1 bug"));
  });

  it("shows no issues message when no findings", () => {
    const md = generateMarkdown(makeReview({ findings: [] }));

    assert.ok(md.includes("No issues found."));
  });

  it("includes breaking changes section when present", () => {
    const md = generateMarkdown(makeReview({
      breakingChanges: true,
      breakingChangeDetails: "Removed /v1/login endpoint",
    }));

    assert.ok(md.includes("## Breaking Changes"));
    assert.ok(md.includes("Removed /v1/login endpoint"));
  });

  it("omits breaking changes section when none", () => {
    const md = generateMarkdown(makeReview());

    assert.ok(!md.includes("## Breaking Changes"));
  });
});
