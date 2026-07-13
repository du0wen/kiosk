import { pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { organization } from "./auth";

/**
 * Per-org branding (P4). App-owned. `theme_color` (#rrggbb) + `export_watermark`
 * text; applied to the /v shell and exports. Brand name reuses organization.name.
 */
export const orgSettings = pgTable("org_settings", {
  organizationId: text("organization_id")
    .primaryKey()
    .references(() => organization.id, { onDelete: "cascade" }),
  themeColor: text("theme_color"),
  exportWatermark: text("export_watermark"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export type OrgSettings = typeof orgSettings.$inferSelect;
