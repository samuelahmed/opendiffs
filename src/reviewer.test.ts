import { describe, it } from "node:test";
import * as assert from "node:assert/strict";
import { parseReviewResponse, parsePorcelainLines } from "./reviewer";
import { ChangeContext, ReviewScope } from "./types";

const stubChange: ChangeContext = {
  label: "test",
  author: "tester",
  date: new Date().toISOString(),
  branch: "main",
  filesChanged: 1,
  insertions: 10,
  deletions: 2,
};

const scope: ReviewScope = "staged";

const fullResponse = {
  summary: "Refactored auth module",
  keyChanges: ["Extracted token refresh logic", "Added retry on 401"],
  confidence: 8,
  confidenceReason: "Verified callers and tests",
  riskAssessment: "Low risk, isolated change",
  findings: [
    { file: "src/auth.ts", line: 42, severity: "nit", title: "Unused import", detail: "Remove unused import of Logger" },
  ],
  filesOverview: [
    { file: "src/auth.ts", overview: "Refactored token refresh" },
  ],
  breakingChanges: false,
  breakingChangeDetails: null,
};

describe("parsePorcelainLines", () => {
  it("parses unstaged modified file (leading space)", () => {
    const result = parsePorcelainLines(" M package.json\n");
    assert.equal(result.length, 1);
    assert.equal(result[0].file, "package.json");
    assert.equal(result[0].status, "M");
  });

  it("parses staged modified file", () => {
    const result = parsePorcelainLines("M  package.json\n");
    assert.equal(result[0].file, "package.json");
    assert.equal(result[0].status, "M");
  });

  it("parses untracked file", () => {
    const result = parsePorcelainLines("?? new-file.ts\n");
    assert.equal(result[0].file, "new-file.ts");
    assert.equal(result[0].status, "??");
  });

  it("parses multiple files", () => {
    const result = parsePorcelainLines(" M src/cli.ts\nA  src/new.ts\n?? tmp.log\n");
    assert.equal(result.length, 3);
    assert.equal(result[0].file, "src/cli.ts");
    assert.equal(result[1].file, "src/new.ts");
    assert.equal(result[1].status, "A");
    assert.equal(result[2].file, "tmp.log");
    assert.equal(result[2].status, "??");
  });

  it("handles empty output", () => {
    assert.deepEqual(parsePorcelainLines(""), []);
    assert.deepEqual(parsePorcelainLines("\n"), []);
  });
});

describe("parseReviewResponse", () => {
  it("parses clean JSON", () => {
    const raw = JSON.stringify(fullResponse);
    const review = parseReviewResponse(raw, stubChange, scope, "claude");

    assert.equal(review.summary, "Refactored auth module");
    assert.equal(review.confidence, 8);
    assert.equal(review.findings.length, 1);
    assert.equal(review.findings[0].file, "src/auth.ts");
    assert.equal(review.provider, "claude");
  });

  it("parses JSON in markdown fences", () => {
    const raw = "```json\n" + JSON.stringify(fullResponse) + "\n```";
    const review = parseReviewResponse(raw, stubChange, scope, "codex");

    assert.equal(review.summary, "Refactored auth module");
    assert.equal(review.confidence, 8);
  });

  it("parses JSON with surrounding prose", () => {
    const raw = "Here is my review:\n\n" + JSON.stringify(fullResponse) + "\n\nLet me know if you have questions.";
    const review = parseReviewResponse(raw, stubChange, scope, "claude");

    assert.equal(review.summary, "Refactored auth module");
    assert.equal(review.findings.length, 1);
  });

  it("clamps confidence above 10 to 10", () => {
    const raw = JSON.stringify({ ...fullResponse, confidence: 15 });
    const review = parseReviewResponse(raw, stubChange, scope);

    assert.equal(review.confidence, 10);
  });

  it("clamps confidence below 1 to 1", () => {
    const raw = JSON.stringify({ ...fullResponse, confidence: -3 });
    const review = parseReviewResponse(raw, stubChange, scope);

    assert.equal(review.confidence, 1);
  });

  it("defaults confidence to 5 when not a number", () => {
    const raw = JSON.stringify({ ...fullResponse, confidence: "high" });
    const review = parseReviewResponse(raw, stubChange, scope);

    assert.equal(review.confidence, 5);
  });

  it("uses defaults for missing fields", () => {
    const raw = JSON.stringify({});
    const review = parseReviewResponse(raw, stubChange, scope, "claude");

    assert.equal(review.summary, "No summary provided.");
    assert.deepEqual(review.keyChanges, []);
    assert.equal(review.confidence, 5);
    assert.equal(review.riskAssessment, "No risk assessment provided.");
    assert.deepEqual(review.findings, []);
    assert.deepEqual(review.filesOverview, []);
    assert.equal(review.breakingChanges, false);
    assert.equal(review.breakingChangeDetails, null);
  });

  it("filters findings with missing required fields", () => {
    const raw = JSON.stringify({
      ...fullResponse,
      findings: [
        { file: "a.ts", severity: "bug", title: "Real bug", detail: "It crashes" },
        { file: "b.ts", severity: "nit" },  // missing title and detail
        { severity: "risk", title: "No file", detail: "Oops" },  // missing file
        { file: "c.ts", title: "No severity", detail: "Hmm" },  // missing severity
      ],
    });
    const review = parseReviewResponse(raw, stubChange, scope);

    assert.equal(review.findings.length, 1);
    assert.equal(review.findings[0].file, "a.ts");
  });

  it("filters filesOverview with missing required fields", () => {
    const raw = JSON.stringify({
      ...fullResponse,
      filesOverview: [
        { file: "a.ts", overview: "Changed auth" },
        { foo: "bar" },
        { file: "b.ts" },
        { overview: "Something" },
      ],
    });
    const review = parseReviewResponse(raw, stubChange, scope);

    assert.equal(review.filesOverview.length, 1);
    assert.equal(review.filesOverview[0].file, "a.ts");
  });

  it("filters entries with truthy but non-string fields", () => {
    const raw = JSON.stringify({
      ...fullResponse,
      findings: [
        { file: 123, severity: true, title: "Bad", detail: "Types" },
        { file: "a.ts", severity: "bug", title: "Real", detail: "Valid" },
      ],
      filesOverview: [
        { file: 123, overview: true },
        { file: "a.ts", overview: "Valid" },
      ],
    });
    const review = parseReviewResponse(raw, stubChange, scope);

    assert.equal(review.findings.length, 1);
    assert.equal(review.findings[0].file, "a.ts");
    assert.equal(review.filesOverview.length, 1);
    assert.equal(review.filesOverview[0].file, "a.ts");
  });

  it("returns fallback for empty string", () => {
    const review = parseReviewResponse("", stubChange, scope, "claude");

    assert.equal(review.summary, "Could not parse review response.");
    assert.equal(review.confidence, 0);
  });

  it("returns fallback for garbage input", () => {
    const review = parseReviewResponse("lol this is not json at all!!!", stubChange, scope);

    assert.equal(review.summary, "Could not parse review response.");
    assert.equal(review.confidence, 0);
  });

  it("returns fallback for malformed JSON", () => {
    const review = parseReviewResponse('{"summary": "oops", broken}', stubChange, scope);

    assert.equal(review.summary, "Could not parse review response.");
    assert.equal(review.confidence, 0);
  });

  it("preserves changeInfo and scope", () => {
    const raw = JSON.stringify(fullResponse);
    const review = parseReviewResponse(raw, stubChange, "file", "codex");

    assert.equal(review.change, stubChange);
    assert.equal(review.reviewScope, "file");
    assert.equal(review.provider, "codex");
  });
});
