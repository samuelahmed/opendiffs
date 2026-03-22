#!/usr/bin/env node

import * as p from "@clack/prompts";
import pc from "picocolors";
import { Config, ReviewScope } from "./types";
import { loadConfig, saveConfig, getPromptPath, getReviewsDir } from "./config";
import * as fs from "fs";
import * as path from "path";
import { getDiff, getChangeInfo, getChangedFiles, getAllChangedFiles, callProvider, parseReviewResponse } from "./reviewer";
import { saveReport, pruneReports, collectMdFiles } from "./report";
import { formatReview } from "./format";
import { DEFAULT_PROMPT } from "./prompt";

const cwd = process.cwd();

async function main() {
  const args = process.argv.slice(2);

  if (args.includes("--help") || args.includes("-h")) {
    printHelp();
    return;
  }

  if (args.includes("--version") || args.includes("-v")) {
    console.log("opendiffs 0.1.0");
    return;
  }

  if (args.includes("--settings")) {
    await runSettings();
    return;
  }

  if (args.includes("--reports")) {
    await browseReports();
    return;
  }

  const saveFlag = args.includes("--save");
  const providerFlag = getArgValue(args, "--provider");
  const fileArg = args.find((a) => !a.startsWith("-"));

  const config = loadConfig(cwd);

  if (providerFlag) {
    config.providers = providerFlag.split(",").map((p) => p.trim());
  }
  if (saveFlag) {
    config.saveReports = "always";
  }

  let scope: ReviewScope;
  let filePath: string | undefined;

  if (fileArg) {
    scope = "file";
    filePath = fileArg;
  } else if (args.includes("--staged")) {
    scope = "staged";
  } else {
    const result = await pickScope();
    if (!result) return;
    scope = result.scope;
    filePath = result.filePath;
  }

  await runReview(config, scope, filePath);
}

async function pickScope(): Promise<{ scope: ReviewScope; filePath?: string } | null> {
  const [stagedFiles, allChangedFiles] = await Promise.all([
    getChangedFiles(cwd, "staged"),
    getAllChangedFiles(cwd),
  ]);

  p.intro(pc.bold("OpenDiffs"));

  if (allChangedFiles.length === 0) {
    p.log.warn("No changes found.");
    p.outro("");
    return null;
  }

  type ScopeOption = "staged" | "file";
  const options: { value: ScopeOption; label: string; hint?: string }[] = [];

  if (stagedFiles.length > 0) {
    options.push({
      value: "staged",
      label: "Review staged changes",
      hint: `${stagedFiles.length} file${stagedFiles.length !== 1 ? "s" : ""}`,
    });
  }

  if (allChangedFiles.length > 0) {
    options.push({
      value: "file",
      label: "Review a file...",
      hint: `${allChangedFiles.length} changed file${allChangedFiles.length !== 1 ? "s" : ""}`,
    });
  }

  const choice = await p.select({
    message: "What do you want to review?",
    options,
  });

  if (p.isCancel(choice)) {
    p.cancel("Cancelled");
    return null;
  }

  if (choice === "file") {
    const selected = await p.select({
      message: "Select a file to review",
      options: allChangedFiles.map((f) => ({
        value: f.file,
        label: f.file,
        hint: f.status === "??" ? "new" : f.status === "M" ? "modified" : f.status === "A" ? "added" : f.status === "D" ? "deleted" : f.status,
      })),
    });

    if (p.isCancel(selected)) {
      p.cancel("Cancelled");
      return null;
    }

    return { scope: "file", filePath: selected as string };
  }

  return { scope: "staged" };
}

async function runReview(config: Config, scope: ReviewScope, filePath?: string) {
  let diff: string;
  try {
    diff = await getDiff(cwd, scope, filePath);
  } catch (err: any) {
    p.log.error(err.message);
    process.exit(1);
  }

  if (!diff.trim()) {
    const label =
      scope === "staged"
        ? "No staged changes to review."
        : `No changes in ${filePath}.`;
    p.log.warn(label);
    return;
  }

  const changeInfo = await getChangeInfo(cwd, scope, filePath);
  const providersToRun = config.providers.length > 0 ? config.providers : ["claude"];

  const shouldSave =
    config.saveReports === "always" ||
    (config.saveReports === "staged-only" && scope === "staged");

  p.log.info(`Reviewing with ${providersToRun.join(", ")}`);

  const reviews: any[] = [];
  const pending = new Set(providersToRun);
  const finished: string[] = [];

  const s = p.spinner();

  function spinnerText() {
    const parts: string[] = [];
    for (const done of finished) parts.push(pc.green(done));
    for (const name of pending) parts.push(`${name}...`);
    return parts.join(pc.dim("  ·  "));
  }

  s.start(spinnerText());

  const promises = providersToRun.map(async (provider) => {
    try {
      const rawResult = await callProvider(cwd, diff, scope, provider);
      const review = parseReviewResponse(rawResult, changeInfo, scope, provider);
      reviews.push(review);

      pending.delete(provider);
      finished.push(`${provider} ${review.confidence}/10 ✓`);

      s.stop(spinnerText());
      console.log(pc.dim("─".repeat(60)));
      console.log(formatReview(review));
      if (shouldSave) {
        try {
          const reportPath = saveReport(review, cwd);
          p.log.info(`Report saved: ${pc.dim(reportPath)}`);
        } catch {}
      }
      if (pending.size > 0) s.start(spinnerText());
    } catch (err: any) {
      pending.delete(provider);
      finished.push(`${provider} failed`);
      s.message(spinnerText());
      p.log.error(`${provider}: ${err.message}`);
    }
  });

  await Promise.all(promises);

  if (shouldSave) {
    try {
      pruneReports(cwd, config.maxReports);
    } catch {}
  }

  p.outro("");
}

async function runSettings() {
  const config = loadConfig(cwd);

  p.intro(pc.bold("OpenDiffs Settings"));

  let changed = false;

  while (true) {
    const providerSummary = config.providers.join(", ") || "claude";

    const choice = await p.select({
      message: "Settings" + (changed ? pc.dim(" — unsaved changes") : ""),
      options: [
        { value: "providers", label: `Providers`, hint: providerSummary },
        { value: "reports", label: `Reports`, hint: config.saveReports === "never" ? "off" : `${config.saveReports}, keep ${config.maxReports}` },
        { value: "fullPrompt", label: `Review prompt`, hint: fs.existsSync(getPromptPath(cwd)) ? "custom" : "default" },
        { value: "done", label: pc.green("Save & exit") },
      ],
    });

    if (p.isCancel(choice)) { p.cancel("Cancelled"); return; }
    if (choice === "done") break;

    if (choice === "providers") {
      const enabled = await p.multiselect({
        message: "Enable providers",
        options: [
          { value: "claude", label: "Claude", hint: "claude CLI" },
          { value: "codex", label: "Codex", hint: "codex CLI" },
        ],
        initialValues: config.providers,
        required: true,
      });
      if (p.isCancel(enabled)) continue;
      config.providers = enabled as string[];
      changed = true;
    }

    if (choice === "reports") {
      const save = await p.select({
        message: "Save reports",
        options: [
          { value: "always", label: "Always" },
          { value: "staged-only", label: "Staged reviews only" },
          { value: "never", label: "Never" },
        ],
        initialValue: config.saveReports,
      });
      if (p.isCancel(save)) continue;
      config.saveReports = save as Config["saveReports"];

      if (save !== "never") {
        const max = await p.text({
          message: "Max reports to keep (oldest auto-deleted)",
          initialValue: String(config.maxReports),
        });
        if (!p.isCancel(max)) {
          config.maxReports = parseInt(max as string, 10) || 50;
        }
      }
      changed = true;
    }

    if (choice === "fullPrompt") {
      const promptPath = getPromptPath(cwd);
      const relativePath = path.relative(cwd, promptPath);
      const fileExists = fs.existsSync(promptPath);

      if (fileExists) {
        const action = await p.select({
          message: `Custom prompt: ${relativePath}`,
          options: [
            { value: "keep", label: "Keep using custom prompt" },
            { value: "reset", label: "Reset to default", hint: "deletes the file" },
          ],
        });
        if (p.isCancel(action)) continue;
        if (action === "reset") {
          fs.unlinkSync(promptPath);
          p.log.info("Reset to default prompt.");
        }
      } else {
        const action = await p.select({
          message: "No custom prompt file found",
          options: [
            { value: "create", label: `Create ${relativePath}`, hint: "starts with the default prompt so you can edit it" },
            { value: "skip", label: "Keep using default" },
          ],
        });
        if (p.isCancel(action)) continue;
        if (action === "create") {
          const dir = path.dirname(promptPath);
          if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
          fs.writeFileSync(promptPath, DEFAULT_PROMPT + "\n", "utf-8");
          p.log.success(`Created ${pc.cyan(relativePath)} — edit it in your editor.`);
        }
      }
    }
  }

  const configPath = saveConfig(cwd, config);
  p.log.success(`Saved to ${pc.dim(configPath)}`);
  p.outro("");
}

async function browseReports() {
  const dir = getReviewsDir(cwd);
  if (!fs.existsSync(dir)) {
    console.log("No reviews yet.");
    return;
  }

  const allFiles: { path: string; mtime: number }[] = [];
  collectMdFiles(dir, allFiles);
  if (allFiles.length === 0) {
    console.log("No reviews yet.");
    return;
  }
  allFiles.sort((a, b) => b.mtime - a.mtime);

  const files = allFiles.map((f) => ({
    ...f,
    relative: path.relative(dir, f.path),
  }));

  const reportOptions = files.map((f) => {
    const content = fs.readFileSync(f.path, "utf-8");
    const scoreMatch = content.match(/Confidence Score: (\d+)\/10/);
    const score = scoreMatch ? parseInt(scoreMatch[1]) : null;
    const scoreLabel = score !== null
      ? score >= 8 ? pc.green(`${score}/10`)
        : score >= 5 ? pc.yellow(`${score}/10`)
          : pc.red(`${score}/10`)
      : "";
    const filename = f.relative.split("/").pop() || "";
    const dateStr = filename.slice(0, 10);
    const timeStr = filename.slice(11, 17);
    const time = timeStr ? `${timeStr.slice(0, 2)}:${timeStr.slice(2, 4)}` : "";
    const branch = path.dirname(f.relative);
    const slug = filename.slice(18).replace(/\.md$/, "").replace(/-/g, " ");

    return {
      value: f.path,
      label: `${scoreLabel}  ${slug || "review"}  ${pc.dim(branch !== "." ? branch : "")}  ${pc.dim(`${dateStr} ${time}`)}`,
    };
  });

  p.intro(pc.bold("Reviews"));

  while (true) {
    const options = [...reportOptions, { value: "__exit__", label: pc.dim("Exit") }];

    const choice = await p.select({
      message: `${files.length} review${files.length !== 1 ? "s" : ""}`,
      options,
    });

    if (p.isCancel(choice) || choice === "__exit__") {
      p.outro("");
      return;
    }

    const content = fs.readFileSync(choice as string, "utf-8");
    console.log("");
    console.log(renderMarkdown(content));
    console.log("");
  }
}

function renderMarkdown(md: string): string {
  return md
    .split("\n")
    .map((line) => {
      if (line.startsWith("# ")) return pc.bold(pc.cyan(line.slice(2)));
      if (line.startsWith("## ")) {
        const text = line.slice(3);
        const scoreMatch = text.match(/Confidence Score: (\d+)\/10/);
        if (scoreMatch) {
          const score = parseInt(scoreMatch[1]);
          const color = score >= 8 ? pc.green : score >= 5 ? pc.yellow : pc.red;
          return color(pc.bold(text));
        }
        return pc.bold(pc.blue(text));
      }
      line = line.replace(/\*\*(.+?)\*\*/g, (_, t) => pc.bold(t));
      line = line.replace(/`(.+?)`/g, (_, t) => pc.cyan(t));
      if (/^\|[-|: ]+\|$/.test(line)) return pc.dim(line);
      if (line.startsWith("|")) return line.replace(/\|/g, pc.dim("|"));
      if (line.startsWith("- ")) return `${pc.dim("•")} ${line.slice(2)}`;
      if (line.startsWith("---")) return pc.dim("─".repeat(50));
      if (line.startsWith("*") && line.endsWith("*")) return pc.dim(line.slice(1, -1));
      line = line.replace(/\bBUG\b/g, pc.red(pc.bold("BUG")));
      line = line.replace(/\bRISK\b/g, pc.yellow(pc.bold("RISK")));
      line = line.replace(/\bNIT\b/g, pc.gray("NIT"));
      return line;
    })
    .join("\n");
}

function getArgValue(args: string[], flag: string): string | undefined {
  const idx = args.indexOf(flag);
  if (idx === -1 || idx + 1 >= args.length) return undefined;
  return args[idx + 1];
}

function printHelp() {
  console.log(`
  ${pc.bold("opendiffs")} — AI-powered code review from the terminal

  ${pc.bold("Usage")}
    opendiffs                    Interactive review menu
    opendiffs ${pc.dim("<file>")}             Review a specific file
    opendiffs --settings         Configure providers, prompt, and more

  ${pc.bold("Options")}
    --staged                     Review staged changes (skip menu)
    --provider ${pc.dim("<name>")}            Provider: claude, codex, or claude,codex
    --save                       Save markdown report
    --settings                   Configure settings
    --reports                    Browse and read saved reviews
    --help                       Show this help
    --version                    Show version
`);
}

main().catch((err) => {
  console.error(pc.red(err.message));
  process.exit(1);
});
