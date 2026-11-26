CREATE TABLE "org_template_version" (
	"id" uuid PRIMARY KEY NOT NULL,
	"template_id" uuid NOT NULL,
	"version_number" integer NOT NULL,
	"content_id" uuid,
	"legacy_html" text,
	"prompt_guidelines" text,
	"change_note" text,
	"created_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "org_templates" (
	"id" uuid PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"category" text DEFAULT 'custom' NOT NULL,
	"description" text,
	"prompt_guidelines" text,
	"current_content_id" uuid,
	"legacy_html" text,
	"current_version" integer DEFAULT 1 NOT NULL,
	"is_default" boolean DEFAULT false NOT NULL,
	"created_by" text NOT NULL,
	"updated_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "org_audit_log" (
	"id" uuid PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"actor_user_id" text,
	"actor_email" text,
	"action" text NOT NULL,
	"target_type" text,
	"target_id" text,
	"summary" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "org_settings" ADD COLUMN "watermark_mode" text DEFAULT 'footer' NOT NULL;--> statement-breakpoint
ALTER TABLE "org_settings" ADD COLUMN "watermark_scope" text DEFAULT 'org_only' NOT NULL;--> statement-breakpoint
ALTER TABLE "org_settings" ADD COLUMN "watermark_include_viewer" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "org_settings" ADD COLUMN "watermark_opacity" integer DEFAULT 8 NOT NULL;--> statement-breakpoint
ALTER TABLE "org_settings" ADD COLUMN "allow_public_pages" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "org_settings" ADD COLUMN "allow_member_export" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "org_template_version" ADD CONSTRAINT "org_template_version_template_id_org_templates_id_fk" FOREIGN KEY ("template_id") REFERENCES "public"."org_templates"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "org_template_version" ADD CONSTRAINT "org_template_version_content_id_page_content_id_fk" FOREIGN KEY ("content_id") REFERENCES "public"."page_content"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "org_template_version" ADD CONSTRAINT "org_template_version_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "org_templates" ADD CONSTRAINT "org_templates_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "org_templates" ADD CONSTRAINT "org_templates_current_content_id_page_content_id_fk" FOREIGN KEY ("current_content_id") REFERENCES "public"."page_content"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "org_templates" ADD CONSTRAINT "org_templates_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "org_templates" ADD CONSTRAINT "org_templates_updated_by_user_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "org_audit_log" ADD CONSTRAINT "org_audit_log_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "org_audit_log" ADD CONSTRAINT "org_audit_log_actor_user_id_user_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "org_template_version_tpl_num_uq" ON "org_template_version" USING btree ("template_id","version_number");--> statement-breakpoint
CREATE UNIQUE INDEX "org_templates_org_slug_active_uq" ON "org_templates" USING btree ("organization_id","slug") WHERE "org_templates"."deleted_at" is null;--> statement-breakpoint
CREATE INDEX "org_templates_org_category_idx" ON "org_templates" USING btree ("organization_id","category") WHERE "org_templates"."deleted_at" is null;--> statement-breakpoint
CREATE INDEX "org_audit_log_org_created_idx" ON "org_audit_log" USING btree ("organization_id","created_at");--> statement-breakpoint
CREATE INDEX "org_audit_log_org_action_idx" ON "org_audit_log" USING btree ("organization_id","action");