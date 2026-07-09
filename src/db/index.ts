import { drizzle } from "drizzle-orm/neon-serverless";
import { Pool, neonConfig } from "@neondatabase/serverless";
import ws from "ws";
import * as schema from "./schema";

// neon-serverless (WebSocket) is used instead of neon-http so Better Auth's
// multi-step writes can run in transactions. `ws` is required under Node.
neonConfig.webSocketConstructor = ws;

const pool = new Pool({ connectionString: process.env.DATABASE_URL! });

export const db = drizzle(pool, { schema });
export type DB = typeof db;
