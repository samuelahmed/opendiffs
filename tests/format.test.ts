import { describe, it } from "node:test";
import * as assert from "node:assert/strict";
import { renderMarkdown } from "../src/format.js";

describe("renderMarkdown", () => {
  it("renders markdown without throwing and returns a string", () => {
    const md = [
      "# Summary",
      "Some **bold** text and `inline code`.",
      "## Confidence: 8/10",
      "- First item",
      "- Second item",
      "### BUG: Null reference",
    ].join("\n");

    const out = renderMarkdown(md);
    assert.equal(typeof out, "string");
    assert.ok(out.length > 0);
  });

  it("handles empty input", () => {
    const out = renderMarkdown("");
    assert.equal(typeof out, "string");
  });
});
