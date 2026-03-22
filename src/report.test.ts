import { describe, it } from "node:test";
import * as assert from "node:assert/strict";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import { saveRawReport } from "./report.js";
import { ChangeContext } from "./types.js";

describe("saveRawReport", () => {
  it("saves markdown to disk and returns the path", () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "opendiffs-test-"));
    const change: ChangeContext = {
      label: "staged changes",
      author: "tester",
      date: new Date().toISOString(),
      branch: "main",
      filesChanged: 1,
      insertions: 5,
      deletions: 2,
    };

    const md = "# Summary\nThis is a test review.\n## Confidence: 8/10\n";
    const filePath = saveRawReport(md, change, "claude", tmpDir);

    assert.ok(fs.existsSync(filePath));
    assert.equal(fs.readFileSync(filePath, "utf-8"), md);
    assert.ok(filePath.endsWith(".md"));
    assert.ok(filePath.includes("claude"));

    fs.rmSync(tmpDir, { recursive: true });
  });
});
