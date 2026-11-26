import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const CSS = "src/app/(dashboard)/members/_components/MembersClient.module.css";
const read = () => readFile(join(process.cwd(), CSS), "utf8");

describe("members pending row overflow guards", () => {
  it("lets the invite info column shrink (min-width:0)", async () => {
    const css = await read();
    expect(css).toMatch(/\.invites > div > span:nth-child\(2\)\s*\{[^}]*min-width:\s*0/);
  });
  it("ellipsizes long invite email/meta instead of widening the page", async () => {
    const css = await read();
    expect(css).toMatch(/text-overflow:\s*ellipsis/);
    expect(css).toMatch(/white-space:\s*nowrap/);
  });
  it("keeps the status badge from shrinking", async () => {
    const css = await read();
    expect(css).toMatch(/\.invites > div > :last-child\s*\{[^}]*flex:\s*0 0 auto/);
  });
});
