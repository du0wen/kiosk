import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const read = (rel: string) => readFile(join(process.cwd(), rel), "utf8");
const CSS = "src/app/(dashboard)/pages/_components/RecentVersions.module.css";

describe("RecentVersions width alignment", () => {
  it("caps the whole section at the shared form width, so header + list align", async () => {
    const css = await read(CSS);
    expect(css).toMatch(/\.section\s*\{[^}]*max-width:\s*var\(--form-max\)/);
    expect(css).toMatch(/\.section\s*\{[^}]*width:\s*100%/);
  });

  it("lets the list fill the section instead of re-capping itself narrower", async () => {
    const css = await read(CSS);
    // The width constraint lives on .section only; the list stretches to it.
    expect(css).not.toMatch(/\.list\s*\{[^}]*max-width:/);
    expect(css).toMatch(/\.list\s*\{[^}]*width:\s*100%/);
  });

  it("uses the global token, never a hardcoded pixel width", async () => {
    const css = await read(CSS);
    expect(css).not.toMatch(/max-width:\s*\d/);
  });

  it("lets the header wrap on narrow screens instead of overflowing", async () => {
    const css = await read(CSS);
    expect(css).toMatch(/\.head\s*\{[^}]*flex-wrap:\s*wrap/);
  });
});
