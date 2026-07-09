# Kiosk P1 · Plan 5 — Skill Packaging Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the AI-tool-facing skill — `kiosk install-skill` writes a Claude Code `SKILL.md` and a Codex `AGENTS.md` section that teach an agent to publish with the CLI — plus `kiosk open`.

**Architecture:** Skill text lives as string constants in the CLI package (`cli/src/skills.ts`); `installSkill()` materializes them into the target directory (idempotently for Codex). `openBrowser` is extracted to `cli/src/browser.ts` and shared by `login` and `open`. `open` resolves a file's URL from `.kiosk/pages.json`.

**Tech Stack:** Node built-ins (`fs`), TypeScript, Vitest.

> Plan **5 of 6**. Consumes Plan 4 (`state.ts`, `cli.ts`) and Plan 4b (`login.ts` `openBrowser`). Pure/local — no DB, no server.

## Global Constraints

- `install-skill [--claude] [--codex]`: no flag → do **both**. Writes into the **current directory** (`.claude/skills/kiosk/SKILL.md`; append a section to `./AGENTS.md`). `--global` (`~/.claude/...`) is a later option.
- Codex append is **idempotent** (skip if the section marker already present).
- `SKILL.md` front-matter: `name: kiosk`, one-line `description`. Skill text is **English** (per §6.5 i18n scope).
- `open <file>`: open the URL recorded in `.kiosk/pages.json` for that file; if none, a friendly error. (`open <id>` deferred — the URL is printed at publish time.)
- Commits carry **no AI attribution**.

---

## File Structure

- `cli/src/browser.ts` — `openBrowser(url)` (extracted from `login.ts`).
- `cli/src/login.ts` — **modify** to import `openBrowser` from `./browser.js`.
- `cli/src/skills.ts` — `SKILL_MD`, `CODEX_SECTION`, `installSkill({ dir, claude, codex })`.
- `cli/src/open.ts` — `resolveOpenUrl(root, target)`.
- `cli/src/cli.ts` — **modify** to add `install-skill` and `open` commands.
- Tests: `cli/src/skills.test.ts`, `cli/src/open.test.ts`.

---

### Task 1: Skill content + `install-skill`

**Files:**
- Create: `cli/src/browser.ts`, `cli/src/skills.ts`, `cli/src/skills.test.ts`
- Modify: `cli/src/login.ts` (import `openBrowser`), `cli/src/cli.ts` (add `install-skill`)

**Interfaces:**
- Produces:
  - `openBrowser(url: string): void` (in `browser.ts`).
  - `SKILL_MD: string`, `CODEX_SECTION: string`.
  - `installSkill({ dir, claude, codex }): string[]` — returns the paths written.

- [ ] **Step 1: Create `cli/src/browser.ts`**

```typescript
import { spawn } from "node:child_process";

/** Best-effort open a URL in the user's browser. */
export function openBrowser(url: string): void {
  const cmd =
    process.platform === "darwin"
      ? "open"
      : process.platform === "win32"
        ? "start"
        : "xdg-open";
  try {
    spawn(cmd, [url], { stdio: "ignore", detached: true }).unref();
  } catch {
    // could not open automatically; callers print the URL
  }
}
```

- [ ] **Step 2: Update `cli/src/login.ts` to use it**

Remove the local `openBrowser` function from `login.ts` and add at the top with the other imports:
```typescript
import { openBrowser } from "./browser.js";
```
(The `spawn` import in `login.ts` is now unused — remove `import { spawn } from "node:child_process";` from `login.ts`.)

- [ ] **Step 3: Write the failing test `cli/src/skills.test.ts`**

```typescript
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { installSkill, SKILL_MD } from "./skills";

let dir: string;
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "kiosk-skill-"));
});
afterEach(() => rmSync(dir, { recursive: true, force: true }));

describe("installSkill", () => {
  it("writes the Claude SKILL.md and a Codex AGENTS.md section", () => {
    const written = installSkill({ dir, claude: true, codex: true });
    const skill = readFileSync(join(dir, ".claude", "skills", "kiosk", "SKILL.md"), "utf8");
    expect(skill).toBe(SKILL_MD);
    expect(skill).toContain("name: kiosk");
    const agents = readFileSync(join(dir, "AGENTS.md"), "utf8");
    expect(agents).toContain("Publishing HTML with Kiosk");
    expect(written).toHaveLength(2);
  });

  it("is idempotent for the Codex section (no duplicate)", () => {
    writeFileSync(join(dir, "AGENTS.md"), "# Existing\n\nSome notes.\n");
    installSkill({ dir, claude: false, codex: true });
    installSkill({ dir, claude: false, codex: true });
    const agents = readFileSync(join(dir, "AGENTS.md"), "utf8");
    const count = agents.split("Publishing HTML with Kiosk").length - 1;
    expect(count).toBe(1);
    expect(agents).toContain("# Existing");
  });
});
```

- [ ] **Step 4: Run test to verify it fails**

Run: `pnpm exec vitest run cli/src/skills.test.ts`
Expected: FAIL — `Cannot find module './skills'`.

- [ ] **Step 5: Implement `cli/src/skills.ts`**

```typescript
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
      const sep = existing && !existing.endsWith("\n") ? "\n\n" : existing ? "\n" : "";
      appendFileSync(p, sep + CODEX_SECTION + "\n");
    }
    written.push(p);
  }
  return written;
}
```

- [ ] **Step 6: Run test to verify it passes**

Run: `pnpm exec vitest run cli/src/skills.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 7: Add the `install-skill` command to `cli/src/cli.ts`**

Add a `case` before `default:`:
```typescript
      case "install-skill": {
        const { values } = parseArgs({
          args: rest,
          options: { claude: { type: "boolean" }, codex: { type: "boolean" } },
        });
        const both = !values.claude && !values.codex;
        const { installSkill } = await import("./skills.js");
        const written = installSkill({
          dir: process.cwd(),
          claude: both || !!values.claude,
          codex: both || !!values.codex,
        });
        process.stdout.write(`Installed skill files:\n${written.map((w) => "  " + w).join("\n")}\n`);
        return 0;
      }
```
And add `install-skill` to the `USAGE` string.

- [ ] **Step 8: Typecheck + commit**

```bash
pnpm exec tsc -p cli/tsconfig.json --noEmit
git add cli/src/browser.ts cli/src/skills.ts cli/src/skills.test.ts cli/src/login.ts cli/src/cli.ts
git commit -m "feat(cli): install-skill writes Claude SKILL.md + Codex AGENTS.md section"
```
Expected: typecheck clean.

---

### Task 2: `kiosk open`

**Files:**
- Create: `cli/src/open.ts`, `cli/src/open.test.ts`
- Modify: `cli/src/cli.ts` (add `open`)

**Interfaces:**
- Consumes: `findProjectRoot`/`readState`/`mappingKey` (Plan 4), `openBrowser` (Task 1).
- Produces: `resolveOpenUrl(root: string, target: string): string` — the stored URL for a file, or throws.

- [ ] **Step 1: Write the failing test `cli/src/open.test.ts`**

```typescript
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { resolveOpenUrl } from "./open";
import { writeMapping, mappingKey } from "./state";

let root: string;
beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "kiosk-open-"));
  mkdirSync(join(root, ".kiosk"), { recursive: true });
});
afterEach(() => rmSync(root, { recursive: true, force: true }));

describe("resolveOpenUrl", () => {
  it("returns the stored URL for a mapped file", () => {
    const file = join(root, "page.html");
    writeMapping(root, mappingKey(root, file), { id: "abc", url: "https://k/p/abc" });
    expect(resolveOpenUrl(root, file)).toBe("https://k/p/abc");
  });
  it("throws for an unmapped file", () => {
    expect(() => resolveOpenUrl(root, join(root, "nope.html"))).toThrow();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run cli/src/open.test.ts`
Expected: FAIL — `Cannot find module './open'`.

- [ ] **Step 3: Implement `cli/src/open.ts`**

```typescript
import { readState, mappingKey } from "./state.js";

/** The public URL recorded for a file in .kiosk/pages.json, or throw. */
export function resolveOpenUrl(root: string, target: string): string {
  const entry = readState(root).pages[mappingKey(root, target)];
  if (!entry) {
    throw new Error(
      `No published page mapped to ${target}. Publish it first (kiosk publish ${target}), or open the printed URL directly.`,
    );
  }
  return entry.url;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm exec vitest run cli/src/open.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Add the `open` command to `cli/src/cli.ts`**

Add a `case` before `default:`:
```typescript
      case "open": {
        const { positionals } = parseArgs({ args: rest, allowPositionals: true });
        const target = positionals[0];
        if (!target) throw new CliError("Usage: kiosk open <file>");
        const { findProjectRoot } = await import("./state.js");
        const { resolveOpenUrl } = await import("./open.js");
        const { openBrowser } = await import("./browser.js");
        const url = resolveOpenUrl(findProjectRoot(process.cwd()), target);
        process.stdout.write(url + "\n");
        openBrowser(url);
        return 0;
      }
```
And add `open <file>` to the `USAGE` string.

- [ ] **Step 6: Typecheck + full test gate**

Run:
```bash
pnpm exec tsc -p cli/tsconfig.json --noEmit
pnpm test
```
Expected: CLI typecheck clean; all vitest files pass (app + cli, incl. `skills`, `open`).

- [ ] **Step 7: Commit**

```bash
git add cli/src/open.ts cli/src/open.test.ts cli/src/cli.ts
git commit -m "feat(cli): kiosk open <file> opens the published URL"
```

---

## Self-Review

**1. Spec coverage (§2.5 skill packaging, §2.2 install-skill/open):**
- `install-skill --claude/--codex` (default both) writing `SKILL.md` + `AGENTS.md` section → Task 1. ✓
- SKILL.md with front-matter + publish instructions (self-contained HTML, auth, update-same-URL) → Task 1 `SKILL_MD`. ✓
- Codex section, idempotent → Task 1 (+ test). ✓
- `kiosk open <file>` → Task 2. ✓
- `openBrowser` shared (DRY) → Task 1 `browser.ts` + login refactor. ✓
- **Gaps (intentional, flagged):** `open <id>` (URL is printed at publish; deferred); `--global` install target (later).

**2. Placeholder scan:** none — full code + exact commands.

**3. Type consistency:** `installSkill({ dir, claude, codex }) → string[]` used in Task 1 command. `resolveOpenUrl(root, target) → string` used in Task 2 command. `openBrowser(url)` (Task 1) consumed by `login.ts` (refactor) and the `open` command. `readState`/`mappingKey`/`findProjectRoot` reused verbatim from Plan 4.
