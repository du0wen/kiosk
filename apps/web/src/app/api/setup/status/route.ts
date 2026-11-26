import { access, constants, mkdir } from "node:fs/promises";
import { dirname } from "node:path";
import { NextResponse } from "next/server";
import { resolveSetupConfigPath } from "@/lib/setup/config-file";
import { requireSetupMode } from "@/lib/setup/guard";
import { resolveRequestOrigin, suggestServeOrigin } from "@/lib/setup/origins";
import { resolveLocalStorageDir } from "@/lib/storage/local-path";

async function isConfigDirWritable(configPath: string): Promise<boolean> {
  try {
    const dir = dirname(configPath);
    await mkdir(dir, { recursive: true });
    await access(dir, constants.W_OK);
    return true;
  } catch {
    return false;
  }
}

export async function GET(req: Request): Promise<NextResponse> {
  const locked = await requireSetupMode();
  if (locked) return locked;

  const configPath = resolveSetupConfigPath();
  const writable = await isConfigDirWritable(configPath);

  const detectedOrigin = resolveRequestOrigin(req);
  const appOrigin = process.env.APP_ORIGIN?.trim() || detectedOrigin;
  const serveOrigin = process.env.SERVE_ORIGIN?.trim() || suggestServeOrigin(appOrigin);

  return NextResponse.json({
    writable,
    defaults: {
      appOrigin,
      serveOrigin,
      databaseUrl: process.env.DATABASE_URL?.trim() || "",
      databaseUrlPresent: Boolean(process.env.DATABASE_URL?.trim()),
      localStorageDir: resolveLocalStorageDir(),
      configPath,
    },
  });
}
