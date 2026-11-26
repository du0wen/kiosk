import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

const read = (rel: string) => readFile(new URL(rel, import.meta.url), "utf8");

// Each Settings concern is now its own real page. Guards the "one page, one
// form" split so General can never regress into also rendering Branding.
describe("Settings route composition", () => {
  it("General page renders only General (no Branding, no Tokens)", async () => {
    const src = await read("./page.tsx");
    expect(src).toContain("GeneralForm");
    expect(src).not.toContain("BrandingForm");
    expect(src).not.toContain("TokensClient");
  });

  it("Branding page renders only Branding (no General, no Tokens)", async () => {
    const src = await read("./branding/page.tsx");
    expect(src).toContain("BrandingForm");
    expect(src).not.toContain("GeneralForm");
    expect(src).not.toContain("TokensClient");
  });

  it("API Tokens page renders only Tokens (no General, no Branding)", async () => {
    const src = await read("./api-tokens/page.tsx");
    expect(src).toContain("TokensClient");
    expect(src).not.toContain("GeneralForm");
    expect(src).not.toContain("BrandingForm");
  });

  it("Storage page renders only the platform storage client", async () => {
    const src = await read("./storage/page.tsx");
    expect(src).toContain("StorageClient");
    expect(src).not.toContain("GeneralForm");
    expect(src).not.toContain("BrandingForm");
  });

  it("every Settings page uses the shared SettingsLayout", async () => {
    for (const rel of ["./page.tsx", "./branding/page.tsx", "./api-tokens/page.tsx", "./storage/page.tsx"]) {
      expect(await read(rel)).toContain("SettingsLayout");
    }
  });

  it("SettingsLayout caps width with the shared token, not a hardcoded value", async () => {
    const src = await read("./_components/SettingsLayout.module.css");
    expect(src).toContain("var(--settings-content-max)");
  });
});
