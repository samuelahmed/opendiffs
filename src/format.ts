import { marked } from "marked";
import TerminalRenderer from "marked-terminal";

marked.setOptions({ renderer: new TerminalRenderer() as any });

export function renderMarkdown(md: string): string {
  return marked.parse(md) as string;
}
