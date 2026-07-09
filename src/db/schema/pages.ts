import {
  pgTable,
  uuid,
  text,
  integer,
  timestamp,
  index,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { organization, user } from "./auth";
// Relative import: drizzle-kit's schema loader does not resolve the "@/" alias.
import { uuidv7 } from "../../lib/id";

export const pages = pgTable(
  "pages",
  {
    id: uuid("id")
      .primaryKey()
      .$defaultFn(() => uuidv7()),
    publicId: text("public_id").notNull(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    createdBy: text("created_by")
      .notNull()
      .references(() => user.id),
    title: text("title"),
    contentHtml: text("content_html").notNull(),
    sizeBytes: integer("size_bytes").notNull(),
    contentHash: text("content_hash"),
    viewCount: integer("view_count").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (t) => [
    uniqueIndex("pages_public_id_uq").on(t.publicId),
    index("pages_org_active_idx")
      .on(t.organizationId)
      .where(sql`${t.deletedAt} is null`),
  ],
);

export type Page = typeof pages.$inferSelect;
export type NewPage = typeof pages.$inferInsert;
