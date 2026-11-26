CREATE TABLE "abuse_reports" (
	"id" uuid PRIMARY KEY NOT NULL,
	"page_id" uuid,
	"public_id" text,
	"page_url" text NOT NULL,
	"category" text DEFAULT 'phishing' NOT NULL,
	"details" text NOT NULL,
	"reporter_ip_hash" text,
	"status" text DEFAULT 'pending' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "pages" ADD COLUMN "blocked_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "pages" ADD COLUMN "blocked_reason" text;--> statement-breakpoint
ALTER TABLE "abuse_reports" ADD CONSTRAINT "abuse_reports_page_id_pages_id_fk" FOREIGN KEY ("page_id") REFERENCES "public"."pages"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "abuse_reports_page_idx" ON "abuse_reports" USING btree ("page_id");--> statement-breakpoint
CREATE INDEX "abuse_reports_status_idx" ON "abuse_reports" USING btree ("status");--> statement-breakpoint
CREATE INDEX "abuse_reports_created_idx" ON "abuse_reports" USING btree ("created_at");