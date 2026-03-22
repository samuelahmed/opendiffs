import { describe, it } from "node:test";
import * as assert from "node:assert/strict";
import { buildPrompt, DEFAULT_PROMPT } from "../src/prompt.js";

describe("buildPrompt", () => {
  it("uses default prompt when custom prompt is empty", () => {
    const result = buildPrompt("staged", "/tmp/test.diff", "");
    assert.ok(result.includes(DEFAULT_PROMPT));
    assert.ok(result.includes("/tmp/test.diff"));
  });

  it("uses custom prompt instead of default when provided", () => {
    const custom = "You are a security reviewer. Focus on vulnerabilities.";
    const result = buildPrompt("staged", "/tmp/test.diff", custom);
    assert.ok(result.includes(custom));
    assert.ok(!result.includes(DEFAULT_PROMPT));
  });

  it("includes scope context for staged reviews", () => {
    const result = buildPrompt("staged", "/tmp/test.diff", "");
    assert.ok(result.includes("Staged changes"));
  });

  it("includes scope context for file reviews", () => {
    const result = buildPrompt("file", "/tmp/test.diff", "");
    assert.ok(result.includes("Single file change"));
  });

  it("includes the diff file path", () => {
    const diffPath = "/tmp/opendiffs-abc123.diff";
    const result = buildPrompt("staged", diffPath, "");
    assert.ok(result.includes(diffPath));
  });
});
