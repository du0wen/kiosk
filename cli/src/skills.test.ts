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
    const skill = readFileSync(
      join(dir, ".claude", "skills", "kiosk", "SKILL.md"),
      "utf8",
    );
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
