import { spawn, execFile } from "child_process";
import * as crypto from "crypto";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import { ChangeContext, Review, ReviewScope, OPENDIFFS_DIR, REVIEWS_DIR, VALID_PROVIDERS } from "./types";
import { buildPrompt } from "./prompt";
import { loadCustomPrompt } from "./config";

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

export async function getChangeInfo(cwd: string, scope: ReviewScope, filePath?: string): Promise<ChangeContext> {
  const branch = await getBranch(cwd);

  let statArgs: string[];
  if (scope === "file" && filePath) {
    statArgs = ["diff", "--cached", "--stat", "--stat-width=999", "--", filePath];
  } else {
    statArgs = ["diff", "--cached", "--stat", "--stat-width=999"];
  }

  let statOut = "";
  try {
    statOut = await exec("git", statArgs, cwd);
    if (!statOut.trim() && scope === "file" && filePath) {
      statOut = await exec("git", ["diff", "--stat", "--stat-width=999", "--", filePath], cwd);
    }
  } catch {
    // git diff --stat failed — stat fields will default to 0
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
    scope === "file" && filePath
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

export async function getAllChangedFiles(cwd: string): Promise<{ file: string; status: string }[]> {
  try {
    const out = await exec("git", ["status", "--porcelain", "-u"], cwd);
    return out
      .trim()
      .split("\n")
      .filter(Boolean)
      .map((line) => {
        const status = line.slice(0, 2).trim();
        const file = line.slice(3);
        return { file, status };
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
    const prompt = buildPrompt(scope, diffFile, customPrompt);

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

// --- Parse response ---

export function parseReviewResponse(raw: string, changeInfo: ChangeContext, scope: ReviewScope, provider: string = ""): Review {
  let jsonStr = raw.trim();

  const fenceMatch = jsonStr.match(/```(?:json)?\s*\n?([\s\S]*?)\n?\s*```/);
  if (fenceMatch) {
    jsonStr = fenceMatch[1].trim();
  }

  const objStart = jsonStr.indexOf("{");
  const objEnd = jsonStr.lastIndexOf("}");
  if (objStart === -1 || objEnd === -1) {
    return fallbackReview(changeInfo, scope, provider);
  }
  jsonStr = jsonStr.slice(objStart, objEnd + 1);

  try {
    const parsed = JSON.parse(jsonStr);
    return {
      change: changeInfo,
      summary: parsed.summary || "No summary provided.",
      keyChanges: Array.isArray(parsed.keyChanges) ? parsed.keyChanges : [],
      confidence: typeof parsed.confidence === "number" ? Math.min(10, Math.max(1, parsed.confidence)) : 5,
      confidenceReason: parsed.confidenceReason || "",
      riskAssessment: parsed.riskAssessment || "No risk assessment provided.",
      findings: Array.isArray(parsed.findings)
        ? parsed.findings.filter((f: any) => typeof f.file === "string" && typeof f.severity === "string" && typeof f.title === "string" && typeof f.detail === "string")
        : [],
      filesOverview: Array.isArray(parsed.filesOverview)
        ? parsed.filesOverview.filter((f: any) => typeof f.file === "string" && typeof f.overview === "string")
        : [],
      breakingChanges: parsed.breakingChanges === true,
      breakingChangeDetails: parsed.breakingChangeDetails || null,
      timestamp: new Date().toISOString(),
      reviewScope: scope,
      provider: provider || "default",
    };
  } catch {
    return fallbackReview(changeInfo, scope, provider);
  }
}

function fallbackReview(changeInfo: ChangeContext, scope: ReviewScope, provider: string = ""): Review {
  return {
    change: changeInfo,
    summary: "Could not parse review response.",
    keyChanges: [],
    confidence: 0,
    confidenceReason: "Review parsing failed.",
    riskAssessment: "Unable to assess risk — review manually.",
    findings: [],
    filesOverview: [],
    breakingChanges: false,
    breakingChangeDetails: null,
    timestamp: new Date().toISOString(),
    reviewScope: scope,
    provider: provider || "default",
  };
}
