import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

describe("dialog centering", () => {
  // base.css `* { margin: 0 }` wipes the UA default that centers a modal
  // <dialog>. The component stylesheet must restore `margin: auto`, or every
  // dialog pins to the top-left corner.
  it("restores margin:auto on the dialog element", async () => {
    const css = await readFile(new URL("./Dialog.module.css", import.meta.url), "utf8");
    expect(css).toMatch(/\.dialog\s*\{[^}]*\bmargin:\s*auto\b/);
  });

  it("keeps the modal scrollable within the viewport", async () => {
    const css = await readFile(new URL("./Dialog.module.css", import.meta.url), "utf8");
    expect(css).toMatch(/max-height:/);
    expect(css).toMatch(/\.body\s*\{[^}]*overflow:\s*auto/);
  });
});
