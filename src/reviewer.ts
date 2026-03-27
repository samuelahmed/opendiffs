import { spawn, execFile } from "child_process";
import * as crypto from "crypto";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import { ChangeContext, ReviewScope, OPENDIFFS_DIR, REVIEWS_DIR, VALID_PROVIDERS } from "./types.js";
import { buildPrompt } from "./prompt.js";
import { loadCustomPrompt } from "./config.js";

// Track temp diff files so they can be cleaned up on unexpected exit
const activeTempFiles = new Set<string>();

function cleanupTempFiles() {
  for (const f of activeTempFiles) {
    try { fs.unlinkSync(f); } catch {}
  }
  activeTempFiles.clear();
}

process.on("exit", cleanupTempFiles);

// --- Shell exec helper ---

function exec(cmd: string, args: string[], cwd: string): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile(cmd, args, { cwd, maxBuffer: 10 * 1024 * 1024 }, (err, stdout, stderr) => {
      if (err) reject(new Error(stderr || err.message));
      else resolve(stdout);
    });
  });
}

// --- Git info ---

async function getBranch(cwd: string): Promise<string> {
  try {
    return (await exec("git", ["rev-parse", "--abbrev-ref", "HEAD"], cwd)).trim();
  } catch {
    return "(no commits)";
  }
}

export async function getDefaultBaseBranch(cwd: string): Promise<string | null> {
  for (const name of ["main", "master"]) {
    try {
      await exec("git", ["rev-parse", "--verify", name], cwd);
      return name;
    } catch {}
  }
  return null;
}

export async function getMergeBase(cwd: string, base: string): Promise<string> {
  return (await exec("git", ["merge-base", base, "HEAD"], cwd)).trim();
}

export async function getBranchCommitCount(cwd: string, base: string): Promise<number> {
  try {
    const mergeBase = await getMergeBase(cwd, base);
    const out = await exec("git", ["rev-list", "--count", `${mergeBase}..HEAD`], cwd);
    return parseInt(out.trim(), 10) || 0;
  } catch {
    return 0;
  }
}

export async function getChangeInfo(cwd: string, scope: ReviewScope, filePath?: string): Promise<ChangeContext> {
  const branch = await getBranch(cwd);

  let statOut = "";
  if (scope === "branch" && filePath) {
    try {
      const mergeBase = await getMergeBase(cwd, filePath);
      statOut = await exec("git", ["diff", mergeBase, "HEAD", "--stat", "--stat-width=999"], cwd);
    } catch {}
  } else if (scope === "commit" && filePath) {
    try {
      statOut = await exec("git", ["diff", `${filePath}~1`, filePath, "--stat", "--stat-width=999"], cwd);
    } catch {
      try {
        statOut = await exec("git", ["diff", "--root", filePath, "--stat", "--stat-width=999"], cwd);
      } catch {}
    }
  } else {
    const statArgs = scope === "file" && filePath
      ? ["diff", "--cached", "--stat", "--stat-width=999", "--", filePath]
      : ["diff", "--cached", "--stat", "--stat-width=999"];
    try {
      statOut = await exec("git", statArgs, cwd);
      if (!statOut.trim() && scope === "file" && filePath) {
        statOut = await exec("git", ["diff", "--stat", "--stat-width=999", "--", filePath], cwd);
      }
    } catch {
      // git diff --stat failed — stat fields will default to 0
    }
  }

  const filesMatch = statOut.match(/(\d+) files? changed/);
  const insMatch = statOut.match(/(\d+) insertions?\(\+\)/);
  const delMatch = statOut.match(/(\d+) deletions?\(-\)/);
  const filesChanged = filesMatch ? parseInt(filesMatch[1], 10) : 0;
  const insertions = insMatch ? parseInt(insMatch[1], 10) : 0;
  const deletions = delMatch ? parseInt(delMatch[1], 10) : 0;

  let author = "Unknown";
  try {
    author = (await exec("git", ["config", "user.name"], cwd)).trim();
  } catch {}

  const scopeLabel =
    scope === "branch"
      ? `Branch ${branch}`
      : scope === "commit" && filePath
        ? `Commit ${filePath.slice(0, 8)}`
        : scope === "file" && filePath
          ? filePath.split("/").pop() || "file"
          : "Staged changes";

  return {
    label: scopeLabel,
    author,
    date: new Date().toISOString(),
    branch,
    filesChanged,
    insertions,
    deletions,
  };
}

// --- Diff retrieval ---

export async function getDiff(cwd: string, scope: ReviewScope, filePath?: string): Promise<string> {
  const exclude = `:(exclude)${OPENDIFFS_DIR}/${REVIEWS_DIR}`;

  if (scope === "branch" && filePath) {
    const mergeBase = await getMergeBase(cwd, filePath);
    return exec("git", ["diff", mergeBase, "HEAD", "--", ".", exclude], cwd);
  }

  if (scope === "commit" && filePath) {
    try {
      return await exec("git", ["diff", `${filePath}~1`, filePath, "--", ".", exclude], cwd);
    } catch {
      // First commit has no parent — show the full tree as a diff
      return exec("git", ["diff", "--root", filePath, "--", ".", exclude], cwd);
    }
  }

  if (scope === "file" && filePath) {
    try {
      const staged = await exec("git", ["diff", "--cached", "--", filePath], cwd);
      if (staged.trim()) return staged;
    } catch {}
    return exec("git", ["diff", "--", filePath], cwd);
  }

  return exec("git", ["diff", "--cached", "--", ".", exclude], cwd);
}

// --- Get list of changed files ---

export async function getStagedFiles(cwd: string): Promise<string[]> {
  try {
    const out = await exec("git", ["diff", "--cached", "--name-only"], cwd);
    return out.trim().split("\n").filter(Boolean);
  } catch {
    return [];
  }
}

export function parsePorcelainLines(out: string): { file: string; status: string }[] {
  return out
    .replace(/\n$/, "")
    .split("\n")
    .filter(Boolean)
    .map((line) => {
      const status = line.slice(0, 2).trim();
      const file = line.slice(3);
      return { file, status };
    });
}

export async function getAllChangedFiles(cwd: string): Promise<{ file: string; status: string }[]> {
  try {
    const out = await exec("git", ["status", "--porcelain", "-u"], cwd);
    return parsePorcelainLines(out);
  } catch {
    return [];
  }
}

export async function getRecentCommits(cwd: string, count = 20): Promise<{ hash: string; subject: string; date: string }[]> {
  try {
    const out = await exec("git", ["log", `--max-count=${count}`, "--format=%H%x00%s%x00%ar"], cwd);
    return out.trim().split("\n").filter(Boolean).map((line) => {
      const [hash, subject, date] = line.split("\0");
      return { hash, subject, date };
    });
  } catch {
    return [];
  }
}

// --- CLI config per provider ---

function getCliArgs(provider: string): { cmd: string; args: string[] } {
  if (!(VALID_PROVIDERS as readonly string[]).includes(provider)) {
    throw new Error(`Unknown provider "${provider}". Valid providers: ${VALID_PROVIDERS.join(", ")}`);
  }

  if (provider === "codex") {
    return { cmd: "codex", args: ["exec", "--full-auto", "-"] };
  }

  return {
    cmd: "claude",
    args: [
      "-p",
      "--output-format", "text",
      "--allowedTools", "Read,Glob,Grep,Bash(git *)",
    ],
  };
}

// --- AI CLI call ---

export function callProvider(
  cwd: string,
  diff: string,
  scope: ReviewScope,
  provider: string,
): Promise<string> {
  return new Promise((resolve, reject) => {
    const customPrompt = loadCustomPrompt(cwd);
    const diffFile = path.join(os.tmpdir(), `opendiffs-${crypto.randomUUID()}.diff`);
    fs.writeFileSync(diffFile, diff, "utf-8");
    activeTempFiles.add(diffFile);
    const prompt = buildPrompt(diffFile, customPrompt);

    const cli = getCliArgs(provider);

    const proc = spawn(cli.cmd, cli.args, {
      cwd,
      stdio: ["pipe", "pipe", "pipe"],
    });

    let stdout = "";
    let stderr = "";
    proc.stdout.on("data", (d: Buffer) => { stdout += d.toString(); });
    proc.stderr.on("data", (d: Buffer) => { stderr += d.toString(); });

    const cleanup = () => {
      try { fs.unlinkSync(diffFile); } catch {}
      activeTempFiles.delete(diffFile);
    };

    let settled = false;
    const settle = (fn: () => void) => { if (!settled) { settled = true; fn(); } };

    const timer = setTimeout(() => {
      proc.kill();
      cleanup();
      settle(() => reject(new Error(`${provider} review timed out after 10 minutes`)));
    }, 600_000);

    proc.on("close", (code: number) => {
      clearTimeout(timer);
      cleanup();
      settle(() => {
        if (code !== 0) {
          reject(new Error(stderr || `${provider} CLI exited with code ${code}. Is it installed?`));
        } else {
          resolve(stdout);
        }
      });
    });

    proc.on("error", (err: Error) => {
      clearTimeout(timer);
      cleanup();
      settle(() => reject(new Error(`${provider} CLI failed: ${err.message}. Is it installed?`)));
    });

    proc.stdin.write(prompt);
    proc.stdin.end();
  });
}

// --- Extract score from markdown ---

export const SCORE_REGEX = /Diffs\s+Score:?\s*(\d+)\s*\/\s*10/i;

export function extractScore(raw: string): number | null {
  const match = raw.match(SCORE_REGEX);
  if (!match) return null;
  const score = parseInt(match[1], 10);
  if (score < 1 || score > 10) return null;
  return score;
}
