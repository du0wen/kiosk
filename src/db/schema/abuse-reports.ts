import {
  pgTable,
  uuid,
  text,
  timestamp,
  index,
} from "drizzle-orm/pg-core";
import { uuidv7 } from "../../lib/id";
import { pages } from "./pages";

export const abuseReports = pgTable(
  "abuse_reports",
  {
    id: uuid("id")
      .primaryKey()
      .$defaultFn(() => uuidv7()),
    pageId: uuid("page_id").references(() => pages.id, { onDelete: "set null" }),
    publicId: text("public_id"),
    pageUrl: text("page_url").notNull(),
    category: text("category").notNull().default("phishing"),
    details: text("details").notNull(),
    reporterIpHash: text("reporter_ip_hash"),
    status: text("status").notNull().default("pending"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("abuse_reports_page_idx").on(t.pageId),
    index("abuse_reports_status_idx").on(t.status),
    index("abuse_reports_created_idx").on(t.createdAt),
  ],
);

export type AbuseReport = typeof abuseReports.$inferSelect;
export type NewAbuseReport = typeof abuseReports.$inferInsert;
