import { describe, it } from "node:test";
import * as assert from "node:assert/strict";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import { loadConfig, saveConfig, addToGitignore, loadCustomPrompt, getPromptPath } from "../src/config.js";

function makeTmpDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), "opendiffs-test-"));
}

function initGitRepo(dir: string) {
  fs.mkdirSync(path.join(dir, ".git"), { recursive: true });
}

describe("loadConfig", () => {
  it("returns defaults when no config file exists", () => {
    const dir = makeTmpDir();
    const config = loadConfig(dir);
    assert.deepEqual(config.providers, ["claude"]);
    assert.equal(config.saveReviews, "always");
    assert.equal(config.maxReviews, 50);
    fs.rmSync(dir, { recursive: true });
  });

  it("merges partial config with defaults", () => {
    const dir = makeTmpDir();
    const configDir = path.join(dir, ".opendiffs");
    fs.mkdirSync(configDir, { recursive: true });
    fs.writeFileSync(
      path.join(configDir, "config.json"),
      JSON.stringify({ providers: ["codex"] }),
      "utf-8",
    );

    const config = loadConfig(dir);
    assert.deepEqual(config.providers, ["codex"]);
    assert.equal(config.saveReviews, "always"); // default preserved
    assert.equal(config.maxReviews, 50); // default preserved
    fs.rmSync(dir, { recursive: true });
  });

  it("returns defaults when config file is corrupt JSON", () => {
    const dir = makeTmpDir();
    const configDir = path.join(dir, ".opendiffs");
    fs.mkdirSync(configDir, { recursive: true });
    fs.writeFileSync(path.join(configDir, "config.json"), "{not json!!", "utf-8");

    const config = loadConfig(dir);
    assert.deepEqual(config.providers, ["claude"]);
    assert.equal(config.saveReviews, "always");
    fs.rmSync(dir, { recursive: true });
  });

  it("resets providers to default if stored as non-array", () => {
    const dir = makeTmpDir();
    const configDir = path.join(dir, ".opendiffs");
    fs.mkdirSync(configDir, { recursive: true });
    fs.writeFileSync(
      path.join(configDir, "config.json"),
      JSON.stringify({ providers: "claude" }), // string, not array
      "utf-8",
    );

    const config = loadConfig(dir);
    assert.deepEqual(config.providers, ["claude"]); // reset to default
    fs.rmSync(dir, { recursive: true });
  });
});

describe("saveConfig", () => {
  it("creates .opendiffs dir and writes config", () => {
    const dir = makeTmpDir();
    initGitRepo(dir);
    const configPath = saveConfig(dir, { providers: ["codex"] });

    assert.ok(fs.existsSync(configPath));
    const saved = JSON.parse(fs.readFileSync(configPath, "utf-8"));
    assert.deepEqual(saved.providers, ["codex"]);
    fs.rmSync(dir, { recursive: true });
  });

  it("merges with existing config instead of overwriting", () => {
    const dir = makeTmpDir();
    initGitRepo(dir);

    saveConfig(dir, { providers: ["claude"], saveReviews: "always" });
    saveConfig(dir, { maxReviews: 100 });

    const configPath = path.join(dir, ".opendiffs", "config.json");
    const saved = JSON.parse(fs.readFileSync(configPath, "utf-8"));
    assert.deepEqual(saved.providers, ["claude"]); // preserved from first save
    assert.equal(saved.saveReviews, "always"); // preserved from first save
    assert.equal(saved.maxReviews, 100); // added by second save
    fs.rmSync(dir, { recursive: true });
  });
});

describe("addToGitignore", () => {
  it("creates .gitignore with .opendiffs entry", () => {
    const dir = makeTmpDir();
    initGitRepo(dir);

    addToGitignore(dir);

    const content = fs.readFileSync(path.join(dir, ".gitignore"), "utf-8");
    assert.ok(content.includes(".opendiffs"));
    fs.rmSync(dir, { recursive: true });
  });

  it("does not duplicate entry on repeated calls", () => {
    const dir = makeTmpDir();
    initGitRepo(dir);

    addToGitignore(dir);
    addToGitignore(dir);

    const content = fs.readFileSync(path.join(dir, ".gitignore"), "utf-8");
    const matches = content.split("\n").filter((l) => l.trim() === ".opendiffs");
    assert.equal(matches.length, 1);
    fs.rmSync(dir, { recursive: true });
  });

  it("appends to existing .gitignore without clobbering", () => {
    const dir = makeTmpDir();
    initGitRepo(dir);
    fs.writeFileSync(path.join(dir, ".gitignore"), "node_modules\n", "utf-8");

    addToGitignore(dir);

    const content = fs.readFileSync(path.join(dir, ".gitignore"), "utf-8");
    assert.ok(content.includes("node_modules"));
    assert.ok(content.includes(".opendiffs"));
    fs.rmSync(dir, { recursive: true });
  });

  it("does nothing when not inside a git repo", () => {
    const dir = makeTmpDir(); // no .git
    addToGitignore(dir);
    assert.ok(!fs.existsSync(path.join(dir, ".gitignore")));
    fs.rmSync(dir, { recursive: true });
  });
});

describe("loadCustomPrompt", () => {
  it("returns empty string when no prompt file exists", () => {
    const dir = makeTmpDir();
    assert.equal(loadCustomPrompt(dir), "");
    fs.rmSync(dir, { recursive: true });
  });

  it("returns file contents when prompt file exists", () => {
    const dir = makeTmpDir();
    const promptPath = getPromptPath(dir);
    fs.mkdirSync(path.dirname(promptPath), { recursive: true });
    fs.writeFileSync(promptPath, "Custom review instructions", "utf-8");

    assert.equal(loadCustomPrompt(dir), "Custom review instructions");
    fs.rmSync(dir, { recursive: true });
  });
});
