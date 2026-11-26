CREATE TABLE "page_content" (
	"id" uuid PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"storage_profile_id" uuid NOT NULL,
	"object_key" text NOT NULL,
	"content_hash" text NOT NULL,
	"size_bytes" integer NOT NULL,
	"status" text DEFAULT 'ready' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "page_content_hash_ck" CHECK ("page_content"."content_hash" ~ '^[0-9a-f]{64}$'),
	CONSTRAINT "page_content_size_ck" CHECK ("page_content"."size_bytes" between 1 and 2097152),
	CONSTRAINT "page_content_status_ck" CHECK ("page_content"."status" in ('ready', 'missing', 'quarantined'))
);
--> statement-breakpoint
ALTER TABLE "page_version" ALTER COLUMN "content_html" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "pages" ALTER COLUMN "content_html" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "page_version" ADD COLUMN "content_id" uuid;--> statement-breakpoint
ALTER TABLE "pages" ADD COLUMN "current_content_id" uuid;--> statement-breakpoint
ALTER TABLE "page_content" ADD CONSTRAINT "page_content_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "page_content" ADD CONSTRAINT "page_content_storage_profile_id_storage_profile_id_fk" FOREIGN KEY ("storage_profile_id") REFERENCES "public"."storage_profile"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "page_content_profile_key_uq" ON "page_content" USING btree ("storage_profile_id","object_key");--> statement-breakpoint
CREATE UNIQUE INDEX "page_content_org_profile_hash_uq" ON "page_content" USING btree ("organization_id","storage_profile_id","content_hash");--> statement-breakpoint
ALTER TABLE "page_version" ADD CONSTRAINT "page_version_content_id_page_content_id_fk" FOREIGN KEY ("content_id") REFERENCES "public"."page_content"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pages" ADD CONSTRAINT "pages_current_content_id_page_content_id_fk" FOREIGN KEY ("current_content_id") REFERENCES "public"."page_content"("id") ON DELETE set null ON UPDATE no action;
