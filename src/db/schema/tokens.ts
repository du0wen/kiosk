import { pgTable, uuid, text, timestamp, index } from "drizzle-orm/pg-core";
import { organization, user } from "./auth";
// Relative import: drizzle-kit's schema loader does not resolve the "@/" alias.
import { uuidv7 } from "../../lib/id";

/**
 * Personal access tokens for the CLI / REST API (Bearer auth).
 * Replaces Better Auth's (nonexistent) apiKey plugin. Plaintext shown once at
 * creation; only the SHA-256 hash + a display prefix are stored.
 */
export const apiToken = pgTable(
  "api_token",
  {
    id: uuid("id")
      .primaryKey()
      .$defaultFn(() => uuidv7()),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    createdBy: text("created_by")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    tokenHash: text("token_hash").notNull().unique(),
    tokenPrefix: text("token_prefix").notNull(), // e.g. "kiosk_live_ab12cd" for display
    lastUsedAt: timestamp("last_used_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
  },
  (t) => [index("api_token_org_idx").on(t.organizationId)],
);

export type ApiToken = typeof apiToken.$inferSelect;
