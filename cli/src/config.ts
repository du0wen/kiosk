import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { homedir } from "node:os";
import { join, dirname } from "node:path";

export const DEFAULT_API_BASE = "http://localhost:3000/api/v1";

export function configPath(): string {
  return join(homedir(), ".config", "kiosk", "config.json");
}

export type Config = { token?: string; apiBase: string };

export function resolveConfig(
  env: Record<string, string | undefined> = process.env,
): Config {
  let fileCfg: Partial<Config> = {};
  try {
    fileCfg = JSON.parse(readFileSync(configPath(), "utf8"));
  } catch {
    // no config file yet
  }
  return {
    token: env.KIOSK_TOKEN || fileCfg.token,
    apiBase: env.KIOSK_API_BASE || fileCfg.apiBase || DEFAULT_API_BASE,
  };
}

export function saveConfig(cfg: Config): void {
  const p = configPath();
  mkdirSync(dirname(p), { recursive: true });
  writeFileSync(p, JSON.stringify(cfg, null, 2), { mode: 0o600 });
}
