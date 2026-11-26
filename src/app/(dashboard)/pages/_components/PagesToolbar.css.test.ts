import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

const read = () => readFile(new URL("./PagesToolbar.module.css", import.meta.url), "utf8");

describe("PagesToolbar responsive", () => {
  it("wraps instead of forcing horizontal overflow", async () => {
    const css = await read();
    expect(css).toMatch(/\.toolbar\s*\{[^}]*flex-wrap:\s*wrap/);
    expect(css).toMatch(/\.toolbar\s*\{[^}]*min-width:\s*0/);
  });
  it("gives each control a full row on narrow screens", async () => {
    const css = await read();
    const mobile = css.match(/@media \(max-width:\s*767px\)\s*\{([\s\S]*)/)?.[1] ?? "";
    expect(mobile).toMatch(/flex:\s*1 1 100%/);
  });
});
