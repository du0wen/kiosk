import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

const readCss = () => readFile(new URL("./TokensClient.module.css", import.meta.url), "utf8");
const readSrc = () => readFile(new URL("./TokensClient.tsx", import.meta.url), "utf8");
const readPage = () => readFile(new URL("../page.tsx", import.meta.url), "utf8");

describe("token preview formatting", () => {
  it("keeps the list token preview on a single line with ellipsis", async () => {
    const css = await readCss();
    expect(css).toMatch(/\.tokenName code\s*\{[^}]*white-space:\s*nowrap/);
    expect(css).toMatch(/\.tokenName code\s*\{[^}]*text-overflow:\s*ellipsis/);
    expect(css).toMatch(/\.tokenName code\s*\{[^}]*overflow:\s*hidden/);
  });
  it("gives the name column min-width:0 so ellipsis can engage", async () => {
    const css = await readCss();
    expect(css).toMatch(/\.tokenName > span:last-child\s*\{[^}]*min-width:\s*0/);
  });
  it("still lets the one-time full token wrap so it stays fully visible", async () => {
    const css = await readCss();
    expect(css).toMatch(/\.created code\s*\{[^}]*overflow-wrap:\s*anywhere/);
  });
});

describe("token one-time value never touches the URL", () => {
  it("client holds the plaintext in component state, not a URL/history hack", async () => {
    const src = await readSrc();
    expect(src).not.toContain("replaceState");
    expect(src).not.toContain("window.history");
    expect(src).not.toContain("searchParams");
    // The prop that used to carry the URL-sourced plaintext is gone.
    expect(src).not.toContain("createdToken");
  });

  it("server page never puts the plaintext into a redirect or query string", async () => {
    const src = await readPage();
    expect(src).not.toContain("searchParams");
    expect(src).not.toContain("?created=");
    expect(src).not.toMatch(/redirect\([^)]*plaintext/);
    expect(src).not.toMatch(/redirect\([^)]*created/);
  });
});
