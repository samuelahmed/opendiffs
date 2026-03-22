import { describe, it } from "node:test";
import * as assert from "node:assert/strict";
import { parsePorcelainLines, extractScore } from "./reviewer.js";

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

describe("extractScore", () => {
  it("extracts score from markdown heading", () => {
    assert.equal(extractScore("## Confidence: 8/10\n"), 8);
  });

  it("extracts score with extra spacing", () => {
    assert.equal(extractScore("##  Confidence:  9 / 10\n"), 9);
  });

  it("returns null when no score found", () => {
    assert.equal(extractScore("no score here"), null);
  });

  it("returns null for out of range scores", () => {
    assert.equal(extractScore("## Confidence: 0/10"), null);
    assert.equal(extractScore("## Confidence: 11/10"), null);
  });

  it("extracts score from larger markdown", () => {
    const md = "# Summary\nSome text\n## Confidence: 7/10\nMore text\n## Findings\n";
    assert.equal(extractScore(md), 7);
  });
});
