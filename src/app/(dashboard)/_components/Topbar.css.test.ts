import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

const read = () => readFile(new URL("./Topbar.module.css", import.meta.url), "utf8");

describe("Topbar visibility (no empty desktop band)", () => {
  it("is hidden on desktop so its grid row collapses to zero", async () => {
    const css = await read();
    expect(css).toMatch(/\.topbar\s*\{[^}]*display:\s*none/);
  });

  it("shows on mobile so the menu button is reachable", async () => {
    const css = await read();
    const mobile = css.match(/@media \(max-width:\s*767px\)\s*\{([\s\S]*)/)?.[1] ?? "";
    expect(mobile).toMatch(/\.topbar\s*\{[^}]*display:\s*flex/);
  });
});
