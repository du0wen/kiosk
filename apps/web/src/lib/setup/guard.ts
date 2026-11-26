import { NextResponse } from "next/server";
import { isSetupCompletedLive } from "./config-file";

export async function requireSetupMode(): Promise<NextResponse | null> {
  if (await isSetupCompletedLive()) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  return null;
}

export const requireSetupSession = requireSetupMode;
