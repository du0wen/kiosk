import { sql } from "drizzle-orm";
import {
  check,
  integer,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { organization } from "./auth";
import { storageProfile } from "./storage-profiles";
import { uuidv7 } from "../../lib/id";

export const pageContent = pgTable(
  "page_content",
  {
    id: uuid("id")
      .primaryKey()
      .$defaultFn(() => uuidv7()),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    storageProfileId: uuid("storage_profile_id")
      .notNull()
      .references(() => storageProfile.id),
    objectKey: text("object_key").notNull(),
    contentHash: text("content_hash").notNull(),
    sizeBytes: integer("size_bytes").notNull(),
    status: text("status").notNull().default("ready"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("page_content_profile_key_uq").on(
      table.storageProfileId,
      table.objectKey,
    ),
    uniqueIndex("page_content_org_profile_hash_uq").on(
      table.organizationId,
      table.storageProfileId,
      table.contentHash,
    ),
    check(
      "page_content_hash_ck",
      sql`${table.contentHash} ~ '^[0-9a-f]{64}$'`,
    ),
    check(
      "page_content_size_ck",
      sql`${table.sizeBytes} between 1 and 2097152`,
    ),
    check(
      "page_content_status_ck",
      sql`${table.status} in ('ready', 'missing', 'quarantined')`,
    ),
  ],
);

export type PageContent = typeof pageContent.$inferSelect;
export type NewPageContent = typeof pageContent.$inferInsert;
