import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { resolveLocalStorageDir } from "./local-path";

describe("resolveLocalStorageDir", () => {
  it("defaults to <cwd>/data/storage when STORAGE_LOCAL_DIR is unset", () => {
    expect(resolveLocalStorageDir({}, "/workspace/kiosk")).toBe(
      resolve("/workspace/kiosk", "data", "storage"),
    );
    expect(resolveLocalStorageDir({ STORAGE_LOCAL_DIR: "   " }, "/workspace/kiosk")).toBe(
      resolve("/workspace/kiosk", "data", "storage"),
    );
  });

  it("resolves a relative STORAGE_LOCAL_DIR against cwd", () => {
    expect(
      resolveLocalStorageDir({ STORAGE_LOCAL_DIR: "./custom-data/html" }, "/workspace/kiosk"),
    ).toBe(resolve("/workspace/kiosk", "custom-data", "html"));
  });

  it("preserves an absolute STORAGE_LOCAL_DIR", () => {
    expect(
      resolveLocalStorageDir({ STORAGE_LOCAL_DIR: "/var/lib/kiosk/storage" }, "/workspace/kiosk"),
    ).toBe("/var/lib/kiosk/storage");
  });
});
