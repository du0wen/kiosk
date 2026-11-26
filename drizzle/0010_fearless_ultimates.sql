CREATE TABLE "storage_profile" (
	"id" uuid PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"provider" text NOT NULL,
	"config" jsonb NOT NULL,
	"credentials_ciphertext" text NOT NULL,
	"credentials_iv" text NOT NULL,
	"credentials_tag" text NOT NULL,
	"credential_key_version" integer DEFAULT 1 NOT NULL,
	"enabled" boolean DEFAULT false NOT NULL,
	"is_default" boolean DEFAULT false NOT NULL,
	"status" text DEFAULT 'unverified' NOT NULL,
	"last_checked_at" timestamp with time zone,
	"last_error_code" text,
	"created_by" text NOT NULL,
	"updated_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "storage_profile" ADD CONSTRAINT "storage_profile_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "storage_profile" ADD CONSTRAINT "storage_profile_updated_by_user_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "storage_profile_name_uq" ON "storage_profile" USING btree ("name");--> statement-breakpoint
CREATE UNIQUE INDEX "storage_profile_single_default_uq" ON "storage_profile" USING btree ("is_default") WHERE "storage_profile"."is_default" = true;--> statement-breakpoint
CREATE INDEX "storage_profile_provider_idx" ON "storage_profile" USING btree ("provider");