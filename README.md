# OpenDiffs

Structured code review using the AI tools you already have.

Review your staged files or any individual changed file before you commit. OpenDiffs uses your existing Claude or Codex CLI to catch bugs, flag risks, and score your changes. No new accounts, no API keys — if you have Claude Code or Codex installed, you're ready to go.

<!-- GIF: run opendiffs → select staged → fast-forward review → show result (~10s) -->

## Install

```bash
npm install -g opendiffs
```

Requires Node.js 18+ and at least one AI CLI:
- [Claude Code](https://docs.anthropic.com/en/docs/claude-code) — `claude`
- [OpenAI Codex](https://github.com/openai/codex) — `codex`

## How it works

Run `opendiffs` and pick what to review:

<!-- screenshot: interactive menu showing "Review staged changes" and "Review a file..." -->

**Review staged changes** — reviews everything in your staging area as one diff, the same changes that would go into your next commit.

**Review a file** — pick a changed file from the list and review it individually.

<!-- screenshot: file picker showing changed files -->

Your agent reads the diff, explores your codebase for context (callers, types, tests), and returns a structured review with a confidence score, findings, and risk assessment.

<!-- screenshot: review output (trimmed/clean example) -->

## Reports

Reviews are saved as markdown in `.opendiffs/reviews/`. Browse them anytime:

```bash
opendiffs --reports
```

<!-- screenshot: reports browser -->

> `.opendiffs/` is automatically added to `.gitignore`.

## Settings

```bash
opendiffs --settings
```

Pick your agents, configure report saving, or customize the review prompt for your project.

<!-- screenshot: settings menu -->

| Setting | Options | Default |
|---------|---------|---------|
| **Providers** | `claude`, `codex`, or both in parallel | `claude` |
| **Save reports** | `always`, `staged-only`, `never` | `always` |
| **Max reports** | any number | `50` |
| **Review prompt** | default or custom `.opendiffs/prompt.md` | default |

## CLI reference

```
opendiffs                    Run it — pick what to review
opendiffs <file>             Review a specific file
opendiffs --staged           Skip the menu, review staged changes
opendiffs --provider claude  Pick your agent (or claude,codex for both)
opendiffs --settings         Configure providers, prompt, reports
opendiffs --reports          Browse saved reviews
```

## License

MIT
