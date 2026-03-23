import { marked } from "marked";
import TerminalRenderer from "marked-terminal";
import pc from "picocolors";

const identity = (s: string) => s;

marked.setOptions({
  renderer: new TerminalRenderer({
    code: identity,
    blockquote: identity,
    html: identity,
    heading: pc.bold,
    firstHeading: pc.bold,
    hr: identity,
    listitem: identity,
    table: identity,
    paragraph: identity,
    strong: pc.bold,
    em: identity,
    codespan: identity,
    del: identity,
    link: identity,
    href: identity,
  }) as any,
});

export function renderMarkdown(md: string): string {
  return marked.parse(md) as string;
}

function scoreColor(score: number): (s: string) => string {
  if (score >= 8) return pc.green;
  if (score >= 6) return pc.yellow;
  return pc.red;
}

export function renderScoreBanner(score: number): string {
  const color = scoreColor(score);
  return "\n" + color(pc.bold(`  Diffs Score: ${score}/10`)) + "\n";
}

export function stripScoreLine(md: string): string {
  return md.replace(/^#{1,2}\s*Diffs\s+Score:?\s*\d+\s*\/\s*10\s*$/im, "").trim();
}
