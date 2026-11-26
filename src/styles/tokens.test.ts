import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

const REQUIRED_TOKENS = [
  "--color-neutral-0",
  "--color-neutral-950",
  "--color-teal-600",
  "--surface-canvas",
  "--surface-primary",
  "--text-primary",
  "--text-secondary",
  "--border-default",
  "--accent-primary",
  "--status-success",
  "--status-danger",
  "--focus-ring",
  "--space-1",
  "--space-10",
  "--font-sans",
  "--font-mono",
  "--font-size-xs",
  "--font-size-2xl",
  "--radius-control",
  "--control-height-md",
  "--shell-sidebar-width",
  "--shell-header-height",
  "--shell-content-max",
  "--shell-content-gutter",
  "--settings-content-max",
  "--form-max",
  "--z-dialog",
] as const;

describe("design tokens", () => {
  it("defines the complete primitive, semantic, and layout contract", async () => {
    const css = await readFile(new URL("./tokens.css", import.meta.url), "utf8");
    for (const token of REQUIRED_TOKENS) {
      expect(css, `missing ${token}`).toContain(`${token}:`);
    }
  });
});
