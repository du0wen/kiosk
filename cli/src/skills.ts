import {
  writeFileSync,
  mkdirSync,
  existsSync,
  readFileSync,
  appendFileSync,
} from "node:fs";
import { join } from "node:path";

export const SKILL_MD = `---
name: kiosk
description: Publish an HTML page to a public, shareable URL. Use when the user wants to share a generated HTML page, report, or visualization as a public link.
---

# Publish to Kiosk

Turn an HTML page into a public, shareable URL with the \`kiosk\` CLI.

## Prerequisites
- The \`kiosk\` CLI is installed (\`npm i -g @kiosk/cli\`) and authenticated:
  - Run \`kiosk login\` once (opens the browser), or set \`KIOSK_TOKEN\` for headless/CI.
  - If publishing fails with an auth error, tell the user to run \`kiosk login\` or set \`KIOSK_TOKEN\`.

## How to publish
1. Write a **single self-contained HTML file** — inline all CSS, JS, and images (data: URIs). The public page is served under a strict CSP that blocks all external network (no external scripts, styles, fonts, images, fetch, or form posts), so nothing external will load.
2. Run: \`kiosk publish <file.html>\`
3. The command prints the public URL. Give that URL to the user.

## Updating
Re-run \`kiosk publish <same-file.html>\` — it updates the same page at the same URL (tracked in \`.kiosk/pages.json\`). Use \`--new\` to force a new page, or \`--id <id>\` to target a specific one.

## Notes
- Max page size 2 MB.
- The page is unlisted: anyone with the link can view it, so do not put secrets in it.
`;

const CODEX_MARKER = "## Publishing HTML with Kiosk";

export const CODEX_SECTION = `${CODEX_MARKER}

To publish an HTML page to a public, shareable URL, use the \`kiosk\` CLI:
- Ensure it is authenticated: \`kiosk login\` (browser) or set \`KIOSK_TOKEN\`.
- Write a single self-contained HTML file (inline CSS/JS/images — served under a strict CSP that blocks external network).
- Run \`kiosk publish <file.html>\`; it prints the public URL. Re-run on the same file to update the same URL.
- Max 2 MB; the page is unlisted (link = access), so no secrets.`;

/** Materialize the skill files into `dir`. Returns the paths written. */
export function installSkill(opts: {
  dir: string;
  claude: boolean;
  codex: boolean;
}): string[] {
  const written: string[] = [];
  if (opts.claude) {
    const skillDir = join(opts.dir, ".claude", "skills", "kiosk");
    mkdirSync(skillDir, { recursive: true });
    const p = join(skillDir, "SKILL.md");
    writeFileSync(p, SKILL_MD);
    written.push(p);
  }
  if (opts.codex) {
    const p = join(opts.dir, "AGENTS.md");
    const existing = existsSync(p) ? readFileSync(p, "utf8") : "";
    if (!existing.includes(CODEX_MARKER)) {
      const sep =
        existing && !existing.endsWith("\n") ? "\n\n" : existing ? "\n" : "";
      appendFileSync(p, sep + CODEX_SECTION + "\n");
    }
    written.push(p);
  }
  return written;
}
