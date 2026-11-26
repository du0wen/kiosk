import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { pageContent } from "@/db/schema";
import { contentDigest, type ContentStore } from "./content-store";
import { StorageError } from "./errors";
import {
  createContentStoreForProfile,
  createContentStore,
  type ResolvedStorageProfile,
} from "./registry";
import { getDefaultStorageProfileWithCredentials } from "./storage-profiles";

export const CONTENT_STORAGE_MODES = ["database", "dual", "external"] as const;
export type ContentStorageMode = (typeof CONTENT_STORAGE_MODES)[number];

export type PreparedExternalContent = {
  storageProfileId: string;
  objectKey: string;
  contentHash: string;
  sizeBytes: number;
};

export type PreparedContentWrite = {
  legacyHtml: string | null;
  external: PreparedExternalContent | null;
};

export type ContentReference = {
  storageProfileId: string;
  objectKey: string;
  contentHash: string;
  sizeBytes: number;
  status: string;
};

export class ContentRepositoryError extends StorageError {
  constructor(
    code: "invalid_configuration" | "storage_unavailable",
    message: string,
  ) {
    super(code, message);
    this.name = "ContentRepositoryError";
  }
}

export function parseContentStorageMode(value: string | undefined): ContentStorageMode {
  if (value === undefined || value === "") return "external";
  if ((CONTENT_STORAGE_MODES as readonly string[]).includes(value)) {
    return value as ContentStorageMode;
  }
  throw new ContentRepositoryError("invalid_configuration", "Invalid content storage mode");
}

type ContentRepositoryDependencies = {
  mode?: ContentStorageMode;
  loadDefaultProfile?: () => Promise<ResolvedStorageProfile | null>;
  createStore?: (profile: ResolvedStorageProfile) => Promise<ContentStore>;
  loadReference?: (
    contentId: string,
    organizationId: string,
  ) => Promise<ContentReference | null>;
  loadStore?: (profileId: string) => Promise<ContentStore>;
};

async function loadContentReference(
  contentId: string,
  organizationId: string,
): Promise<ContentReference | null> {
  const [reference] = await db
    .select({
      storageProfileId: pageContent.storageProfileId,
      objectKey: pageContent.objectKey,
      contentHash: pageContent.contentHash,
      sizeBytes: pageContent.sizeBytes,
      status: pageContent.status,
    })
    .from(pageContent)
    .where(
      and(
        eq(pageContent.id, contentId),
        eq(pageContent.organizationId, organizationId),
      ),
    )
    .limit(1);
  return reference ?? null;
}

export class ContentRepository {
  private readonly mode: ContentStorageMode;
  private readonly loadDefaultProfile: () => Promise<ResolvedStorageProfile | null>;
  private readonly createStore: (profile: ResolvedStorageProfile) => Promise<ContentStore>;
  private readonly loadReference: (
    contentId: string,
    organizationId: string,
  ) => Promise<ContentReference | null>;
  private readonly loadStore: (profileId: string) => Promise<ContentStore>;

  constructor(dependencies: ContentRepositoryDependencies = {}) {
    this.mode = dependencies.mode ?? parseContentStorageMode(process.env.CONTENT_STORAGE_MODE);
    this.loadDefaultProfile =
      dependencies.loadDefaultProfile ?? getDefaultStorageProfileWithCredentials;
    this.createStore =
      dependencies.createStore ?? ((profile) => createContentStoreForProfile(profile));
    this.loadReference = dependencies.loadReference ?? loadContentReference;
    this.loadStore = dependencies.loadStore ?? createContentStore;
  }

  async write<T>(
    input: { organizationId: string; html: string },
    persist: (prepared: PreparedContentWrite) => Promise<T>,
  ): Promise<T> {
    if (this.mode === "database") {
      return persist({ legacyHtml: input.html, external: null });
    }

    let prepared: PreparedContentWrite;
    try {
      if (!/^[A-Za-z0-9_-]{1,128}$/.test(input.organizationId)) {
        throw new Error("Invalid organization id for object key");
      }
      const profile = await this.loadDefaultProfile();
      if (!profile || !profile.enabled || !profile.isDefault || profile.status !== "healthy") {
        throw new Error("No healthy default storage profile");
      }
      const body = new TextEncoder().encode(input.html);
      const contentHash = contentDigest(body);
      const objectKey = `organizations/${input.organizationId}/content/sha256/${contentHash}.html`;
      const store = await this.createStore(profile);
      await store.put({
        key: objectKey,
        body,
        contentHash,
        contentType: "application/octet-stream",
      });
      const metadata = await store.head(objectKey);
      if (
        !metadata ||
        metadata.sizeBytes !== body.byteLength ||
        (metadata.contentHash !== undefined && metadata.contentHash !== contentHash)
      ) {
        throw new Error("Stored object metadata mismatch");
      }
      if (metadata.contentHash === undefined) {
        const stored = await store.get(objectKey);
        if (!stored || contentDigest(stored) !== contentHash) {
          throw new Error("Stored object content mismatch");
        }
      }
      prepared = {
        legacyHtml: this.mode === "external" ? null : input.html,
        external: {
          storageProfileId: profile.id,
          objectKey,
          contentHash,
          sizeBytes: body.byteLength,
        },
      };
    } catch {
      throw new ContentRepositoryError("storage_unavailable", "Content storage is unavailable");
    }
    return persist(prepared);
  }

  async read(input: {
    organizationId: string;
    contentId: string | null;
    legacyHtml: string | null;
  }): Promise<string> {
    if (this.mode === "database") {
      if (input.legacyHtml !== null) return input.legacyHtml;
      throw new ContentRepositoryError("storage_unavailable", "Content storage is unavailable");
    }
    try {
      if (!input.contentId) throw new Error("Missing external content reference");
      const reference = await this.loadReference(input.contentId, input.organizationId);
      if (!reference || reference.status !== "ready") throw new Error("Content is not ready");
      const store = await this.loadStore(reference.storageProfileId);
      const body = await store.get(reference.objectKey);
      if (
        !body ||
        body.byteLength !== reference.sizeBytes ||
        contentDigest(body) !== reference.contentHash
      ) {
        throw new Error("Stored content integrity check failed");
      }
      return new TextDecoder("utf-8", { fatal: true }).decode(body);
    } catch {
      if (this.mode === "dual" && input.legacyHtml !== null) return input.legacyHtml;
      throw new ContentRepositoryError("storage_unavailable", "Content storage is unavailable");
    }
  }
}

export const contentRepository = new ContentRepository();
