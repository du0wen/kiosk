import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { resolveConfig } from "./config";

let home: string;
const origHome = process.env.HOME;
beforeEach(() => {
  home = mkdtempSync(join(tmpdir(), "kiosk-home-"));
  process.env.HOME = home;
});
afterEach(() => {
  process.env.HOME = origHome;
  rmSync(home, { recursive: true, force: true });
});

describe("resolveConfig", () => {
  it("defaults apiBase when nothing is set", () => {
    const c = resolveConfig({});
    expect(c.apiBase).toBe("http://localhost:3000/api/v1");
    expect(c.token).toBeUndefined();
  });
  it("prefers env over the config file", () => {
    mkdirSync(join(home, ".config", "kiosk"), { recursive: true });
    writeFileSync(
      join(home, ".config", "kiosk", "config.json"),
      JSON.stringify({ token: "file_tok", apiBase: "https://file.example/api/v1" }),
    );
    const c = resolveConfig({
      KIOSK_TOKEN: "env_tok",
      KIOSK_API_BASE: "https://env.example/api/v1",
    });
    expect(c.token).toBe("env_tok");
    expect(c.apiBase).toBe("https://env.example/api/v1");
  });
  it("falls back to the config file when env is absent", () => {
    mkdirSync(join(home, ".config", "kiosk"), { recursive: true });
    writeFileSync(
      join(home, ".config", "kiosk", "config.json"),
      JSON.stringify({ token: "file_tok" }),
    );
    const c = resolveConfig({});
    expect(c.token).toBe("file_tok");
  });
});
