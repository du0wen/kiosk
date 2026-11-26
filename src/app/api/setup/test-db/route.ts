import { NextResponse } from "next/server";
import { requireSetupSession } from "@/lib/setup/guard";
import { testDatabaseConnection } from "@/lib/setup/migrator";

export async function POST(req: Request): Promise<NextResponse> {
  const denied = await requireSetupSession();
  if (denied) return denied;

  let body: { databaseUrl?: unknown };
  try {
    body = (await req.json()) as { databaseUrl?: unknown };
  } catch {
    return NextResponse.json({ error: "Invalid JSON payload" }, { status: 400 });
  }

  const databaseUrl = typeof body.databaseUrl === "string" ? body.databaseUrl : "";
  try {
    const result = await testDatabaseConnection(databaseUrl);
    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Database connection failed";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
