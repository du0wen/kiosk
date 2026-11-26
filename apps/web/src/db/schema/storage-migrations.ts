import { sql } from "drizzle-orm";
import {
  bigint,
  check,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { user } from "./auth";
import { storageProfile } from "./storage-profiles";
import { uuidv7 } from "../../lib/id";

export const storageMigration = pgTable(
  "storage_migration",
  {
    id: uuid("id")
      .primaryKey()
      .$defaultFn(() => uuidv7()),
    kind: text("kind").notNull(),
    status: text("status").notNull().default("pending"),
    sourceProfileId: uuid("source_profile_id").references(() => storageProfile.id),
    targetProfileId: uuid("target_profile_id").references(() => storageProfile.id),
    cursor: text("cursor"),
    options: jsonb("options").$type<Record<string, unknown>>().notNull().default({}),
    processedCount: integer("processed_count").notNull().default(0),
    migratedCount: integer("migrated_count").notNull().default(0),
    failedCount: integer("failed_count").notNull().default(0),
    totalBytes: bigint("total_bytes", { mode: "number" }).notNull().default(0),
    lastErrorCode: text("last_error_code"),
    createdBy: text("created_by").references(() => user.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    startedAt: timestamp("started_at", { withTimezone: true }),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    completedAt: timestamp("completed_at", { withTimezone: true }),
  },
  (table) => [
    index("storage_migration_status_idx").on(table.status, table.createdAt),
    check(
      "storage_migration_kind_ck",
      sql`${table.kind} in ('backfill', 'repoint', 'purge', 'orphan_scan', 'orphan_delete')`,
    ),
    check(
      "storage_migration_status_ck",
      sql`${table.status} in ('pending', 'running', 'completed', 'completed_with_failures', 'failed')`,
    ),
    check(
      "storage_migration_counts_ck",
      sql`${table.processedCount} >= 0 and ${table.migratedCount} >= 0 and ${table.failedCount} >= 0 and ${table.totalBytes} >= 0`,
    ),
  ],
);

export const storageMigrationFailure = pgTable(
  "storage_migration_failure",
  {
    id: uuid("id")
      .primaryKey()
      .$defaultFn(() => uuidv7()),
    migrationId: uuid("migration_id")
      .notNull()
      .references(() => storageMigration.id, { onDelete: "cascade" }),
    sourceType: text("source_type").notNull(),
    sourceId: text("source_id").notNull(),
    errorCode: text("error_code").notNull(),
    attempts: integer("attempts").notNull().default(1),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    lastAttemptAt: timestamp("last_attempt_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("storage_migration_failure_source_uq").on(
      table.migrationId,
      table.sourceType,
      table.sourceId,
    ),
    index("storage_migration_failure_run_idx").on(table.migrationId),
    check(
      "storage_migration_failure_source_type_ck",
      sql`${table.sourceType} in ('page', 'version', 'content', 'object')`,
    ),
    check("storage_migration_failure_attempts_ck", sql`${table.attempts} > 0`),
  ],
);

export type StorageMigration = typeof storageMigration.$inferSelect;
export type NewStorageMigration = typeof storageMigration.$inferInsert;
export type StorageMigrationFailure = typeof storageMigrationFailure.$inferSelect;
