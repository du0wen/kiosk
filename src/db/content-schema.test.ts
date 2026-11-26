import { getTableConfig } from "drizzle-orm/pg-core";
import { describe, expect, it } from "vitest";
import {
  pageContent,
  pages,
  pageVersion,
  storageMigration,
  storageMigrationFailure,
} from "@/db/schema";

describe("external page content schema", () => {
  it("records tenant, exact profile, immutable object identity, and health", () => {
    const config = getTableConfig(pageContent);
    expect(config.name).toBe("page_content");
    expect(config.columns.map((column) => column.name)).toEqual(
      expect.arrayContaining([
        "id",
        "organization_id",
        "storage_profile_id",
        "object_key",
        "content_hash",
        "size_bytes",
        "status",
        "created_at",
      ]),
    );
    expect(config.foreignKeys).toHaveLength(2);
    expect(config.indexes.map((index) => index.config.name)).toEqual(
      expect.arrayContaining([
        "page_content_profile_key_uq",
        "page_content_org_profile_hash_uq",
      ]),
    );
  });

  it("adds nullable references and makes rollback HTML nullable", () => {
    expect(pages.currentContentId.notNull).toBe(false);
    expect(pages.contentHtml.notNull).toBe(false);
    expect(pageVersion.contentId.notNull).toBe(false);
    expect(pageVersion.contentHtml.notNull).toBe(false);
  });
});

describe("storage migration schema", () => {
  it("stores durable progress without content or provider error payloads", () => {
    const run = getTableConfig(storageMigration);
    expect(run.columns.map((column) => column.name)).toEqual(
      expect.arrayContaining([
        "kind",
        "status",
        "source_profile_id",
        "target_profile_id",
        "cursor",
        "processed_count",
        "migrated_count",
        "failed_count",
        "total_bytes",
      ]),
    );
    expect(run.columns.map((column) => column.name)).not.toContain("content_html");
  });

  it("deduplicates per-row failures for safe retries", () => {
    const failures = getTableConfig(storageMigrationFailure);
    expect(failures.indexes.map((index) => index.config.name)).toContain(
      "storage_migration_failure_source_uq",
    );
    expect(failures.foreignKeys).toHaveLength(1);
  });
});
