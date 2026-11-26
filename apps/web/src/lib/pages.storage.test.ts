import { randomBytes } from "node:crypto";
import { eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { db } from "@/db";
import { pageContent, pageVersion, storageProfile } from "@/db/schema";
import { cleanupPrincipal, createPrincipal } from "@/test/factories";
import { createPage } from "./pages";
import { MemoryContentStore } from "./storage/adapters/memory";
import { ContentRepository } from "./storage/content-repository";
import { createStorageProfile } from "./storage/storage-profiles";

let principal: Awaited<ReturnType<typeof createPrincipal>> | null = null;
let profileId: string | null = null;
let previousKey: string | undefined;

beforeEach(() => {
  previousKey = process.env.STORAGE_CREDENTIAL_KEY;
  process.env.STORAGE_CREDENTIAL_KEY = randomBytes(32).toString("base64");
});

afterEach(async () => {
  if (principal) {
    await db.delete(pageContent).where(eq(pageContent.organizationId, principal.organizationId));
  }
  if (profileId) await db.delete(storageProfile).where(eq(storageProfile.id, profileId));
  if (principal) await cleanupPrincipal(principal);
  principal = null;
  profileId = null;
  process.env.STORAGE_CREDENTIAL_KEY = previousKey;
});

describe("page external content writes", () => {
  it("persists dual/external references and deduplicates identical objects", async () => {
    principal = await createPrincipal();
    const profile = await createStorageProfile({
      name: `page-storage-${Date.now()}`,
      provider: "s3",
      config: { region: "auto", bucket: "test" },
      credentials: { accessKeyId: "test", secretAccessKey: "test" },
      actorUserId: principal.userId,
      environment: { nodeEnv: "test" },
    });
    profileId = profile.id;
    const resolved = {
      ...profile,
      enabled: true,
      isDefault: true,
      status: "healthy" as const,
      credentials: { accessKeyId: "test", secretAccessKey: "test" },
    };
    const store = new MemoryContentStore();
    const repository = (mode: "dual" | "external") =>
      new ContentRepository({
        mode,
        loadDefaultProfile: async () => resolved,
        createStore: async () => store,
      });

    const dual = await createPage(
      {
        organizationId: principal.organizationId,
        userId: principal.userId,
        html: "<h1>same</h1>",
      },
      { contentRepository: repository("dual") },
    );
    const external = await createPage(
      {
        organizationId: principal.organizationId,
        userId: principal.userId,
        html: "<h1>same</h1>",
      },
      { contentRepository: repository("external") },
    );

    expect(dual.contentHtml).toBe("<h1>same</h1>");
    expect(dual.currentContentId).not.toBeNull();
    expect(external.contentHtml).toBeNull();
    expect(external.currentContentId).toBe(dual.currentContentId);
    const contents = await db
      .select()
      .from(pageContent)
      .where(eq(pageContent.organizationId, principal.organizationId));
    expect(contents).toHaveLength(1);
    const versions = await db
      .select()
      .from(pageVersion)
      .where(eq(pageVersion.pageId, external.id));
    expect(versions[0]).toMatchObject({ contentHtml: null, contentId: dual.currentContentId });

    const concurrentRepository = repository("external");
    const concurrent = await Promise.all([
      createPage(
        {
          organizationId: principal.organizationId,
          userId: principal.userId,
          html: "<h1>concurrent</h1>",
        },
        { contentRepository: concurrentRepository },
      ),
      createPage(
        {
          organizationId: principal.organizationId,
          userId: principal.userId,
          html: "<h1>concurrent</h1>",
        },
        { contentRepository: concurrentRepository },
      ),
    ]);
    expect(concurrent[0].currentContentId).toBe(concurrent[1].currentContentId);
    const afterConcurrent = await db
      .select()
      .from(pageContent)
      .where(eq(pageContent.organizationId, principal.organizationId));
    expect(afterConcurrent).toHaveLength(2);
  });
});
