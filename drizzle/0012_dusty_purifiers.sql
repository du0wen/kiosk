CREATE TABLE "storage_migration" (
	"id" uuid PRIMARY KEY NOT NULL,
	"kind" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"source_profile_id" uuid,
	"target_profile_id" uuid,
	"cursor" text,
	"options" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"processed_count" integer DEFAULT 0 NOT NULL,
	"migrated_count" integer DEFAULT 0 NOT NULL,
	"failed_count" integer DEFAULT 0 NOT NULL,
	"total_bytes" bigint DEFAULT 0 NOT NULL,
	"last_error_code" text,
	"created_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"started_at" timestamp with time zone,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone,
	CONSTRAINT "storage_migration_kind_ck" CHECK ("storage_migration"."kind" in ('backfill', 'repoint', 'purge', 'orphan_scan', 'orphan_delete')),
	CONSTRAINT "storage_migration_status_ck" CHECK ("storage_migration"."status" in ('pending', 'running', 'completed', 'completed_with_failures', 'failed')),
	CONSTRAINT "storage_migration_counts_ck" CHECK ("storage_migration"."processed_count" >= 0 and "storage_migration"."migrated_count" >= 0 and "storage_migration"."failed_count" >= 0 and "storage_migration"."total_bytes" >= 0)
);
--> statement-breakpoint
CREATE TABLE "storage_migration_failure" (
	"id" uuid PRIMARY KEY NOT NULL,
	"migration_id" uuid NOT NULL,
	"source_type" text NOT NULL,
	"source_id" text NOT NULL,
	"error_code" text NOT NULL,
	"attempts" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_attempt_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "storage_migration_failure_source_type_ck" CHECK ("storage_migration_failure"."source_type" in ('page', 'version', 'content', 'object')),
	CONSTRAINT "storage_migration_failure_attempts_ck" CHECK ("storage_migration_failure"."attempts" > 0)
);
--> statement-breakpoint
ALTER TABLE "storage_migration" ADD CONSTRAINT "storage_migration_source_profile_id_storage_profile_id_fk" FOREIGN KEY ("source_profile_id") REFERENCES "public"."storage_profile"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "storage_migration" ADD CONSTRAINT "storage_migration_target_profile_id_storage_profile_id_fk" FOREIGN KEY ("target_profile_id") REFERENCES "public"."storage_profile"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "storage_migration" ADD CONSTRAINT "storage_migration_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "storage_migration_failure" ADD CONSTRAINT "storage_migration_failure_migration_id_storage_migration_id_fk" FOREIGN KEY ("migration_id") REFERENCES "public"."storage_migration"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "storage_migration_status_idx" ON "storage_migration" USING btree ("status","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "storage_migration_failure_source_uq" ON "storage_migration_failure" USING btree ("migration_id","source_type","source_id");--> statement-breakpoint
CREATE INDEX "storage_migration_failure_run_idx" ON "storage_migration_failure" USING btree ("migration_id");