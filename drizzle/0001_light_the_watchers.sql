CREATE TABLE "pages" (
	"id" uuid PRIMARY KEY NOT NULL,
	"public_id" text NOT NULL,
	"organization_id" text NOT NULL,
	"created_by" text NOT NULL,
	"title" text,
	"content_html" text NOT NULL,
	"size_bytes" integer NOT NULL,
	"content_hash" text,
	"view_count" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "pages" ADD CONSTRAINT "pages_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pages" ADD CONSTRAINT "pages_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "pages_public_id_uq" ON "pages" USING btree ("public_id");--> statement-breakpoint
CREATE INDEX "pages_org_active_idx" ON "pages" USING btree ("organization_id") WHERE "pages"."deleted_at" is null;