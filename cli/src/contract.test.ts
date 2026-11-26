import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { USAGE } from "./cli";
import { DEFAULT_API_BASE } from "./config";
import { CODEX_SECTION, SKILL_MD } from "./skills";

type Contract = {
  commands: Record<string, string[]>;
  config: { fields: string[]; defaultApiBase: string };
  state: { fields: string[]; pageFields: string[]; version: number };
};

const contract = JSON.parse(
  readFileSync(
    fileURLToPath(new URL("../contract/v1.json", import.meta.url)),
    "utf8",
  ),
) as Contract;

describe("native CLI compatibility contract", () => {
  it("locks every public command and flag into the TypeScript help", () => {
    for (const [command, flags] of Object.entries(contract.commands)) {
      expect(USAGE).toContain(command);
      for (const flag of flags) expect(USAGE).toContain(flag);
    }
  });

  it("locks config defaults and persisted JSON field names", () => {
    expect(DEFAULT_API_BASE).toBe(contract.config.defaultApiBase);
    expect(contract.config.fields).toEqual(["token", "apiBase"]);
  });

  it("locks project-state field names and version", () => {
    expect(contract.state).toMatchObject({
      fields: ["version", "pages"],
      pageFields: ["id", "url"],
      version: 1,
    });
  });

  it("keeps both CLI implementations on the shared skill copy", () => {
    const contractRoot = new URL("../contract/skills/", import.meta.url);
    expect(SKILL_MD).toBe(
      readFileSync(fileURLToPath(new URL("claude/SKILL.md", contractRoot)), "utf8"),
    );
    expect(CODEX_SECTION + "\n").toBe(
      readFileSync(fileURLToPath(new URL("codex.md", contractRoot)), "utf8"),
    );
  });
});
