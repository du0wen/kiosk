import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

describe("branding preview", () => {
  it("does not nest a second <main> inside the dashboard main", async () => {
    const source = await readFile(new URL("./BrandingForm.tsx", import.meta.url), "utf8");
    expect(source).not.toMatch(/<main[\s/>]/);
    expect(source).not.toMatch(/<\/main>/);
  });

  it("mirrors the real /v shell affordances rather than a fabricated page", async () => {
    const source = await readFile(new URL("./BrandingForm.tsx", import.meta.url), "utf8");
    expect(source).toContain('viewer("openRaw")');
    expect(source).toContain('viewer("report")');
  });
});
