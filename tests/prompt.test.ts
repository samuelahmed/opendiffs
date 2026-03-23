import { describe, it } from "node:test";
import * as assert from "node:assert/strict";
import { buildPrompt, DEFAULT_PROMPT } from "../src/prompt.js";

describe("buildPrompt", () => {
  it("uses default prompt when custom prompt is empty", () => {
    const result = buildPrompt("/tmp/test.diff", "");
    assert.ok(result.includes(DEFAULT_PROMPT));
    assert.ok(result.includes("/tmp/test.diff"));
  });

  it("uses custom prompt instead of default when provided", () => {
    const custom = "You are a security reviewer. Focus on vulnerabilities.";
    const result = buildPrompt("/tmp/test.diff", custom);
    assert.ok(result.includes(custom));
    assert.ok(!result.includes(DEFAULT_PROMPT));
  });

  it("includes the diff file path", () => {
    const diffPath = "/tmp/opendiffs-abc123.diff";
    const result = buildPrompt(diffPath, "");
    assert.ok(result.includes(diffPath));
  });
});
