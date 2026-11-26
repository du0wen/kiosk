import { boolean, integer, pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { organization } from "./auth";

/**
 * Per-org branding, watermark, and security policies (P4 + P10).
 * Brand name reuses organization.name.
 */
export const orgSettings = pgTable("org_settings", {
  organizationId: text("organization_id")
    .primaryKey()
    .references(() => organization.id, { onDelete: "cascade" }),
  themeColor: text("theme_color"),
  exportWatermark: text("export_watermark"),
  // P10 watermark policy: 'off' | 'footer' | 'fullpage'
  watermarkMode: text("watermark_mode").notNull().default("footer"),
  // 'org_only' | 'all'
  watermarkScope: text("watermark_scope").notNull().default("org_only"),
  watermarkIncludeViewer: boolean("watermark_include_viewer").notNull().default(false),
  // Opacity percentage 4..25 (8 => 0.08)
  watermarkOpacity: integer("watermark_opacity").notNull().default(8),
  // P10 org security policies
  allowPublicPages: boolean("allow_public_pages").notNull().default(true),
  allowMemberExport: boolean("allow_member_export").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export type OrgSettings = typeof orgSettings.$inferSelect;
