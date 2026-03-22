import { describe, it } from "node:test";
import * as assert from "node:assert/strict";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import { saveRawReport, pruneReports, collectMdFiles } from "../src/report.js";
import { ChangeContext } from "../src/types.js";

function makeTmpDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), "opendiffs-test-"));
}

function makeChange(overrides?: Partial<ChangeContext>): ChangeContext {
  return {
    label: "staged changes",
    author: "tester",
    date: new Date().toISOString(),
    branch: "main",
    filesChanged: 1,
    insertions: 5,
    deletions: 2,
    ...overrides,
  };
}

describe("saveRawReport", () => {
  it("saves markdown to disk and returns the path", () => {
    const dir = makeTmpDir();
    const md = "# Summary\nThis is a test review.\n## Confidence: 8/10\n";
    const filePath = saveRawReport(md, makeChange(), "claude", dir);

    assert.ok(fs.existsSync(filePath));
    assert.equal(fs.readFileSync(filePath, "utf-8"), md);
    assert.ok(filePath.endsWith(".md"));
    assert.ok(filePath.includes("claude"));
    fs.rmSync(dir, { recursive: true });
  });

  it("organizes reports by branch directory", () => {
    const dir = makeTmpDir();
    const filePath = saveRawReport("review", makeChange({ branch: "feat/login" }), "claude", dir);

    assert.ok(filePath.includes(path.join("feat", "login")));
    fs.rmSync(dir, { recursive: true });
  });

  it("handles special characters in label via slugify", () => {
    const dir = makeTmpDir();
    const filePath = saveRawReport(
      "review",
      makeChange({ label: "My File (v2) [draft].ts" }),
      "claude",
      dir,
    );

    const filename = path.basename(filePath);
    // slugify should strip special chars — no parens, brackets, or spaces
    assert.ok(!filename.includes("("));
    assert.ok(!filename.includes(" "));
    assert.ok(filename.includes("my-file"));
    fs.rmSync(dir, { recursive: true });
  });
});

describe("pruneReports", () => {
  it("deletes oldest files when count exceeds max", () => {
    const dir = makeTmpDir();
    const reviewsDir = path.join(dir, ".opendiffs", "reviews", "main");
    fs.mkdirSync(reviewsDir, { recursive: true });

    // Create 5 files with staggered mtimes
    const files: string[] = [];
    for (let i = 0; i < 5; i++) {
      const filePath = path.join(reviewsDir, `2025-01-0${i + 1}_120000_review.md`);
      fs.writeFileSync(filePath, `review ${i}`);
      // Set distinct mtimes so oldest is deterministic
      const mtime = new Date(2025, 0, i + 1);
      fs.utimesSync(filePath, mtime, mtime);
      files.push(filePath);
    }

    pruneReports(dir, 3);

    const remaining: { path: string; mtime: number }[] = [];
    collectMdFiles(path.join(dir, ".opendiffs", "reviews"), remaining);
    assert.equal(remaining.length, 3);

    // The 2 oldest (Jan 1, Jan 2) should be gone
    assert.ok(!fs.existsSync(files[0]));
    assert.ok(!fs.existsSync(files[1]));
    // The 3 newest should remain
    assert.ok(fs.existsSync(files[2]));
    assert.ok(fs.existsSync(files[3]));
    assert.ok(fs.existsSync(files[4]));

    fs.rmSync(dir, { recursive: true });
  });

  it("does nothing when count is within limit", () => {
    const dir = makeTmpDir();
    const reviewsDir = path.join(dir, ".opendiffs", "reviews", "main");
    fs.mkdirSync(reviewsDir, { recursive: true });

    for (let i = 0; i < 3; i++) {
      fs.writeFileSync(path.join(reviewsDir, `review-${i}.md`), `review ${i}`);
    }

    pruneReports(dir, 10);

    const remaining: { path: string; mtime: number }[] = [];
    collectMdFiles(path.join(dir, ".opendiffs", "reviews"), remaining);
    assert.equal(remaining.length, 3);
    fs.rmSync(dir, { recursive: true });
  });

  it("cleans up empty branch directories after pruning", () => {
    const dir = makeTmpDir();
    const branchDir = path.join(dir, ".opendiffs", "reviews", "old-branch");
    fs.mkdirSync(branchDir, { recursive: true });

    const filePath = path.join(branchDir, "review.md");
    fs.writeFileSync(filePath, "old review");
    const oldTime = new Date(2020, 0, 1);
    fs.utimesSync(filePath, oldTime, oldTime);

    // Add a newer file on a different branch so pruning targets the old one
    const mainDir = path.join(dir, ".opendiffs", "reviews", "main");
    fs.mkdirSync(mainDir, { recursive: true });
    fs.writeFileSync(path.join(mainDir, "recent.md"), "new review");

    pruneReports(dir, 1);

    assert.ok(!fs.existsSync(branchDir), "empty branch dir should be removed");
    fs.rmSync(dir, { recursive: true });
  });

  it("does nothing when reviews directory does not exist", () => {
    const dir = makeTmpDir();
    // Should not throw
    pruneReports(dir, 10);
    fs.rmSync(dir, { recursive: true });
  });
});

describe("collectMdFiles", () => {
  it("recursively finds .md files with mtimes", () => {
    const dir = makeTmpDir();
    fs.mkdirSync(path.join(dir, "sub"), { recursive: true });
    fs.writeFileSync(path.join(dir, "a.md"), "a");
    fs.writeFileSync(path.join(dir, "sub", "b.md"), "b");
    fs.writeFileSync(path.join(dir, "c.txt"), "c"); // not .md

    const results: { path: string; mtime: number }[] = [];
    collectMdFiles(dir, results);

    assert.equal(results.length, 2);
    const names = results.map((r) => path.basename(r.path)).sort();
    assert.deepEqual(names, ["a.md", "b.md"]);
    assert.ok(results.every((r) => typeof r.mtime === "number" && r.mtime > 0));
    fs.rmSync(dir, { recursive: true });
  });
});
