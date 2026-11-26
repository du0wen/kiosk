import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const css = readFileSync(new URL("./CliSetup.module.css", import.meta.url), "utf8");

describe("CLI setup modal layout", () => {
  it("removes ordered-list indentation and lets command rows shrink inside the dialog", () => {
    expect(css).toMatch(/\.steps\s*\{[^}]*margin:\s*0;/s);
    expect(css).toMatch(/\.steps\s*\{[^}]*padding:\s*0;/s);
    expect(css).toMatch(/\.command\s*\{[^}]*min-width:\s*0;/s);
    expect(css).toMatch(/\.command code\s*\{[^}]*min-width:\s*0;/s);
  });
});
