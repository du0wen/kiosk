import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

describe("wide-screen density", () => {
  it("raises typography on >=1600px screens so 1920 doesn't feel small", async () => {
    const css = await readFile(new URL("./tokens.css", import.meta.url), "utf8");
    expect(css).toMatch(/@media \(min-width:\s*1600px\)/);
  });
});

describe("mobile touch targets", () => {
  it("grows icon buttons toward 44px on small screens", async () => {
    const css = await readFile(
      new URL("../components/ui/IconButton.module.css", import.meta.url),
      "utf8",
    );
    expect(css).toMatch(/@media \(max-width:\s*767px\)/);
    expect(css).toMatch(/control-height-lg/);
  });
});
