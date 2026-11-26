import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const CSS = "src/app/(dashboard)/_components/DashboardShell.module.css";
const read = () => readFile(join(process.cwd(), CSS), "utf8");

describe("dashboard content overflow guard", () => {
  // Without min-width:0 the content grid item takes its min-content width — the
  // DataTable's intrinsic column width then pushes the whole page wide instead
  // of scrolling inside the table's own overflow-x viewport (page-level
  // horizontal overflow at 768px and 320px). min-width:0 lets it shrink.
  it("lets the content column shrink so tables scroll internally", async () => {
    const css = await read();
    expect(css).toMatch(/\.content\s*\{[^}]*min-width:\s*0/);
  });
});

describe("dashboard topbar row collapse", () => {
  // The first workspace row sizes to the topbar's content (auto). When the
  // topbar is display:none (desktop, non-search routes) it takes no space —
  // no 64px empty band — without any negative-margin hack. Content and footer
  // are placed explicitly so removing the topbar can't shift them off track.
  it("sizes the topbar row to content and pins content/footer to fixed tracks", async () => {
    const css = await read();
    expect(css).toMatch(/\.workspace\s*\{[^}]*grid-template-rows:\s*auto\s+1fr/);
    expect(css).toMatch(/\.content\s*\{[^}]*grid-row:\s*2/);
    expect(css).toMatch(/\.footer\s*\{[^}]*grid-row:\s*3/);
  });
});
