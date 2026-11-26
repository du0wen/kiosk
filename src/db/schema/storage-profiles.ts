import {
  boolean,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { user } from "./auth";
import { uuidv7 } from "../../lib/id";

export const storageProfile = pgTable(
  "storage_profile",
  {
    id: uuid("id")
      .primaryKey()
      .$defaultFn(() => uuidv7()),
    name: text("name").notNull(),
    provider: text("provider").notNull(),
    config: jsonb("config").$type<Record<string, unknown>>().notNull(),
    credentialsCiphertext: text("credentials_ciphertext").notNull(),
    credentialsIv: text("credentials_iv").notNull(),
    credentialsTag: text("credentials_tag").notNull(),
    credentialKeyVersion: integer("credential_key_version").notNull().default(1),
    enabled: boolean("enabled").notNull().default(false),
    isDefault: boolean("is_default").notNull().default(false),
    status: text("status").notNull().default("unverified"),
    lastCheckedAt: timestamp("last_checked_at", { withTimezone: true }),
    lastErrorCode: text("last_error_code"),
    createdBy: text("created_by").references(() => user.id),
    updatedBy: text("updated_by").references(() => user.id),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("storage_profile_name_uq").on(table.name),
    uniqueIndex("storage_profile_single_default_uq")
      .on(table.isDefault)
      .where(sql`${table.isDefault} = true`),
    index("storage_profile_provider_idx").on(table.provider),
  ],
);

export type StorageProfile = typeof storageProfile.$inferSelect;
export type NewStorageProfile = typeof storageProfile.$inferInsert;
