import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { resolveOpenUrl } from "./open";
import { writeMapping, mappingKey } from "./state";

let root: string;
beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "kiosk-open-"));
  mkdirSync(join(root, ".kiosk"), { recursive: true });
});
afterEach(() => rmSync(root, { recursive: true, force: true }));

describe("resolveOpenUrl", () => {
  it("returns the stored URL for a mapped file", () => {
    const file = join(root, "page.html");
    writeMapping(root, mappingKey(root, file), {
      id: "abc",
      url: "https://k/p/abc",
    });
    expect(resolveOpenUrl(root, file)).toBe("https://k/p/abc");
  });
  it("throws for an unmapped file", () => {
    expect(() => resolveOpenUrl(root, join(root, "nope.html"))).toThrow();
  });
});
