import { resolve } from "node:path";
import { sql } from "drizzle-orm";
import { migrate as migrateNeon } from "drizzle-orm/neon-serverless/migrator";
import { migrate as migratePg } from "drizzle-orm/node-postgres/migrator";
import { createDirectDb } from "@/db";

export function validateDatabaseUrl(connectionString: string): string {
  const trimmed = connectionString.trim();
  if (!trimmed) {
    throw new Error("Database URL is required");
  }
  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    throw new Error("Database URL must be a valid PostgreSQL connection string");
  }
  if (parsed.protocol !== "postgres:" && parsed.protocol !== "postgresql:") {
    throw new Error("Database URL must start with postgres:// or postgresql://");
  }
  return trimmed;
}

export function extractDatabaseErrorMessage(error: unknown): string {
  if (!error || typeof error !== "object") return "Database operation failed";
  const cause = "cause" in error ? error.cause : null;
  if (cause && typeof cause === "object" && "message" in cause && typeof cause.message === "string" && cause.message.trim()) {
    return cause.message.trim();
  }
  if ("message" in error && typeof error.message === "string" && error.message.trim()) {
    return error.message.trim();
  }
  return "Database operation failed";
}

export async function testDatabaseConnection(connectionString: string): Promise<{
  ok: true;
  driver: "neon" | "pg";
}> {
  const url = validateDatabaseUrl(connectionString);
  const direct = createDirectDb(url);
  try {
    await direct.db.execute(sql`select 1 as ok`);
    return { ok: true, driver: direct.driver };
  } catch (error) {
    throw new Error(extractDatabaseErrorMessage(error));
  } finally {
    await direct.close();
  }
}

export async function runDatabaseMigrations(
  connectionString: string,
  migrationsFolder: string = resolve(process.cwd(), "src/db/migrations"),
): Promise<{ ok: true; driver: "neon" | "pg" }> {
  const url = validateDatabaseUrl(connectionString);
  const direct = createDirectDb(url);
  try {
    if (direct.driver === "neon") {
      await migrateNeon(direct.db, { migrationsFolder });
    } else {
      await migratePg(direct.db as never, { migrationsFolder });
    }
    return { ok: true, driver: direct.driver };
  } catch (error) {
    throw new Error(extractDatabaseErrorMessage(error));
  } finally {
    await direct.close();
  }
}
