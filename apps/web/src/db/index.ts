import { drizzle as drizzleNeon } from "drizzle-orm/neon-serverless";
import { drizzle as drizzlePg } from "drizzle-orm/node-postgres";
import { Pool as NeonPool, neonConfig } from "@neondatabase/serverless";
import { Pool as PgPool } from "pg";
import ws from "ws";
import * as schema from "./schema";

// neon-serverless (WebSocket) is used for Neon so Better Auth's multi-step
// writes can run in transactions; standard TCP PostgreSQL uses `pg`.
neonConfig.webSocketConstructor = ws;

export function isNeonConnectionString(connectionString: string): boolean {
  if (process.env.DATABASE_DRIVER === "pg") return false;
  if (process.env.DATABASE_DRIVER === "neon") return true;
  try {
    const host = new URL(connectionString).hostname.toLowerCase();
    return host.endsWith(".neon.tech") || host.endsWith(".neon.build");
  } catch {
    return false;
  }
}

export type DB = ReturnType<typeof drizzleNeon<typeof schema>>;

export function createDirectDb(connectionString: string): {
  db: DB;
  driver: "neon" | "pg";
  close: () => Promise<void>;
} {
  if (isNeonConnectionString(connectionString)) {
    const pool = new NeonPool({ connectionString });
    return {
      db: drizzleNeon(pool, { schema }),
      driver: "neon",
      close: async () => {
        await pool.end().catch(() => {});
      },
    };
  }
  const pool = new PgPool({ connectionString });
  return {
    db: drizzlePg(pool, { schema }) as unknown as DB,
    driver: "pg",
    close: async () => {
      await pool.end().catch(() => {});
    },
  };
}

let activeUrl: string | null = null;
let activeInstance: ReturnType<typeof createDirectDb> | null = null;

function getDbInstance(): DB {
  const currentUrl = process.env.DATABASE_URL?.trim();
  if (!currentUrl) {
    throw new Error("DATABASE_URL is not configured. Complete /setup first.");
  }
  if (!activeInstance || activeUrl !== currentUrl) {
    if (activeInstance) {
      void activeInstance.close();
    }
    activeUrl = currentUrl;
    activeInstance = createDirectDb(currentUrl);
  }
  return activeInstance.db;
}

export async function resetDbConnection(): Promise<void> {
  if (activeInstance) {
    const previous = activeInstance;
    activeInstance = null;
    activeUrl = null;
    await previous.close();
  }
}

export const db: DB = new Proxy({} as DB, {
  get(_target, prop, receiver) {
    const instance = getDbInstance();
    const value = Reflect.get(instance, prop, receiver);
    return typeof value === "function" ? value.bind(instance) : value;
  },
});
