import { describe, it } from "node:test";
import * as assert from "node:assert/strict";
import { formatReview } from "./format";
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
    keyChanges: ["New auth check"],
    confidence: 8,
    confidenceReason: "Verified",
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

describe("formatReview", () => {
  it("includes header with change info", () => {
    const out = formatReview(makeReview());

    assert.ok(out.includes("Staged changes"));
    assert.ok(out.includes("main"));
    assert.ok(out.includes("2 files"));
  });

  it("includes score", () => {
    const out = formatReview(makeReview({ confidence: 9 }));
    assert.ok(out.includes("9/10"));
  });

  it("includes summary and risk assessment", () => {
    const out = formatReview(makeReview());

    assert.ok(out.includes("Added auth middleware"));
    assert.ok(out.includes("Low risk"));
  });

  it("shows no issues message when no findings", () => {
    const out = formatReview(makeReview({ findings: [] }));
    assert.ok(out.includes("No issues found"));
  });

  it("shows findings sorted by severity", () => {
    const out = formatReview(makeReview({
      findings: [
        { file: "a.ts", severity: "nit", title: "Style", detail: "Minor" },
        { file: "b.ts", severity: "bug", title: "Crash", detail: "Null ref" },
        { file: "c.ts", line: 10, severity: "risk", title: "Race", detail: "Maybe" },
      ],
    }));

    const bugIdx = out.indexOf("Crash");
    const riskIdx = out.indexOf("Race");
    const nitIdx = out.indexOf("Style");

    assert.ok(bugIdx < riskIdx, "bug should appear before risk");
    assert.ok(riskIdx < nitIdx, "risk should appear before nit");
  });

  it("includes file:line for findings with line numbers", () => {
    const out = formatReview(makeReview({
      findings: [
        { file: "a.ts", line: 42, severity: "bug", title: "Bug", detail: "Details" },
      ],
    }));

    assert.ok(out.includes("a.ts:42"));
  });

  it("includes breaking changes when present", () => {
    const out = formatReview(makeReview({
      breakingChanges: true,
      breakingChangeDetails: "Removed endpoint",
    }));

    assert.ok(out.includes("Breaking Changes"));
    assert.ok(out.includes("Removed endpoint"));
  });

  it("includes files overview", () => {
    const out = formatReview(makeReview({
      filesOverview: [
        { file: "src/auth.ts", overview: "New middleware" },
        { file: "src/api.ts", overview: "Updated routes" },
      ],
    }));

    assert.ok(out.includes("src/auth.ts"));
    assert.ok(out.includes("New middleware"));
    assert.ok(out.includes("src/api.ts"));
  });
});
