import { sql } from "drizzle-orm";
import {
  boolean,
  index,
  integer,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { organization, user } from "./auth";
import { pageContent } from "./page-content";
import { uuidv7 } from "../../lib/id";

export const orgTemplates = pgTable(
  "org_templates",
  {
    id: uuid("id")
      .primaryKey()
      .$defaultFn(() => uuidv7()),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    slug: text("slug").notNull(),
    name: text("name").notNull(),
    category: text("category").notNull().default("custom"),
    description: text("description"),
    promptGuidelines: text("prompt_guidelines"),
    currentContentId: uuid("current_content_id").references(() => pageContent.id, {
      onDelete: "set null",
    }),
    legacyHtml: text("legacy_html"),
    currentVersion: integer("current_version").notNull().default(1),
    isDefault: boolean("is_default").notNull().default(false),
    createdBy: text("created_by")
      .notNull()
      .references(() => user.id),
    updatedBy: text("updated_by").references(() => user.id),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (t) => [
    uniqueIndex("org_templates_org_slug_active_uq")
      .on(t.organizationId, t.slug)
      .where(sql`${t.deletedAt} is null`),
    index("org_templates_org_category_idx")
      .on(t.organizationId, t.category)
      .where(sql`${t.deletedAt} is null`),
  ],
);

export const orgTemplateVersion = pgTable(
  "org_template_version",
  {
    id: uuid("id")
      .primaryKey()
      .$defaultFn(() => uuidv7()),
    templateId: uuid("template_id")
      .notNull()
      .references(() => orgTemplates.id, { onDelete: "cascade" }),
    versionNumber: integer("version_number").notNull(),
    contentId: uuid("content_id").references(() => pageContent.id, {
      onDelete: "set null",
    }),
    legacyHtml: text("legacy_html"),
    promptGuidelines: text("prompt_guidelines"),
    changeNote: text("change_note"),
    createdBy: text("created_by")
      .notNull()
      .references(() => user.id),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("org_template_version_tpl_num_uq").on(t.templateId, t.versionNumber),
  ],
);

export type OrgTemplate = typeof orgTemplates.$inferSelect;
export type OrgTemplateVersion = typeof orgTemplateVersion.$inferSelect;
