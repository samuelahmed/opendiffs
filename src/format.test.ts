import { describe, it } from "node:test";
import * as assert from "node:assert/strict";
import { renderMarkdown } from "./format.js";

describe("renderMarkdown", () => {
  it("renders h1 headings", () => {
    const out = renderMarkdown("# Summary");
    assert.ok(out.includes("Summary"));
  });

  it("renders h2 headings", () => {
    const out = renderMarkdown("## Risk Assessment");
    assert.ok(out.includes("Risk Assessment"));
  });

  it("renders bold text", () => {
    const out = renderMarkdown("This is **important**");
    assert.ok(out.includes("important"));
  });

  it("renders inline code", () => {
    const out = renderMarkdown("Check `src/auth.ts` for details");
    assert.ok(out.includes("src/auth.ts"));
  });

  it("renders bullet points", () => {
    const out = renderMarkdown("- First item\n- Second item");
    assert.ok(out.includes("First item"));
    assert.ok(out.includes("Second item"));
  });

  it("renders BUG/RISK/NIT labels", () => {
    const out = renderMarkdown("### BUG: Null reference\n### RISK: Race condition\n### NIT: Style");
    assert.ok(out.includes("BUG"));
    assert.ok(out.includes("RISK"));
    assert.ok(out.includes("NIT"));
  });

  it("renders confidence score with color", () => {
    const out = renderMarkdown("## Confidence Score: 8/10");
    assert.ok(out.includes("8/10"));
  });
});
