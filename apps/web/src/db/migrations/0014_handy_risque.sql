ALTER TABLE "api_token" ADD COLUMN "scopes" text[];--> statement-breakpoint
ALTER TABLE "api_token" ADD COLUMN "expires_at" timestamp with time zone;--> statement-breakpoint
CREATE INDEX "api_token_org_active_idx" ON "api_token" USING btree ("organization_id") WHERE "api_token"."revoked_at" is null;