import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const read = (rel: string) => readFile(join(process.cwd(), rel), "utf8");
const TABLE_CSS = "src/app/(dashboard)/pages/_components/PagesTable.module.css";
const TOKENS_CSS = "src/styles/tokens.css";

describe("pages table width alignment", () => {
  it("does not re-cap the table below the shared content width (aligns with header/stats)", async () => {
    const css = await read(TABLE_CSS);
    expect(css).not.toMatch(/\.tableWrap\s*\{[^}]*max-width:/);
  });

  it("leaves the shared shell content max untouched (all pages share 1600px)", async () => {
    const tokens = await read(TOKENS_CSS);
    expect(tokens).toMatch(/--shell-content-max:\s*1600px/);
  });
});

describe("pages table hierarchy", () => {
  it("gives the page title link a stronger weight than its secondary URL", async () => {
    const css = await read(TABLE_CSS);
    expect(css).toMatch(/\.pageLink[^}]*font-weight/);
  });
});
