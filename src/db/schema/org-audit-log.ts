import { index, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { organization, user } from "./auth";
import { uuidv7 } from "../../lib/id";

export const orgAuditLog = pgTable(
  "org_audit_log",
  {
    id: uuid("id")
      .primaryKey()
      .$defaultFn(() => uuidv7()),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    actorUserId: text("actor_user_id").references(() => user.id, {
      onDelete: "set null",
    }),
    actorEmail: text("actor_email"),
    action: text("action").notNull(),
    targetType: text("target_type"),
    targetId: text("target_id"),
    summary: text("summary"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("org_audit_log_org_created_idx").on(t.organizationId, t.createdAt),
    index("org_audit_log_org_action_idx").on(t.organizationId, t.action),
  ],
);

export type OrgAuditLog = typeof orgAuditLog.$inferSelect;
