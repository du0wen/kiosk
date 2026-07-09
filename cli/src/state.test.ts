import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { readState, writeMapping, mappingKey, resolveIdentity } from "./state";

let root: string;
beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "kiosk-proj-"));
});
afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

describe("state", () => {
  it("readState returns an empty state before anything is written", () => {
    expect(readState(root)).toEqual({ version: 1, pages: {} });
  });
  it("writeMapping then readState round-trips by relative key", () => {
    const file = join(root, "page.html");
    const key = mappingKey(root, file);
    writeMapping(root, key, { id: "abc123", url: "https://k/p/abc123" });
    expect(readState(root).pages[key]).toEqual({
      id: "abc123",
      url: "https://k/p/abc123",
    });
  });
});

describe("resolveIdentity", () => {
  it("--id forces update", () => {
    expect(
      resolveIdentity({ root, file: join(root, "x.html"), id: "zzz" }),
    ).toEqual({ mode: "update", id: "zzz" });
  });
  it("--new forces create", () => {
    expect(
      resolveIdentity({ root, file: join(root, "x.html"), forceNew: true }),
    ).toEqual({ mode: "create" });
  });
  it("uses the mapping when present, else create", () => {
    const file = join(root, "x.html");
    expect(resolveIdentity({ root, file })).toEqual({ mode: "create" });
    writeMapping(root, mappingKey(root, file), { id: "map1", url: "u" });
    expect(resolveIdentity({ root, file })).toEqual({ mode: "update", id: "map1" });
  });
});
