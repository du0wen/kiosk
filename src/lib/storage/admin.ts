import { count, desc, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { pageContent, storageMigration, storageProfile } from "@/db/schema";
import { createContentStoreForProfile } from "./registry";
import {
  ensureDefaultLocalStorageProfile,
  getStorageProfileWithCredentials,
  listStorageProfiles,
  recordStorageProfileHealth,
  type StorageProfileView,
} from "./storage-profiles";
import { StorageError } from "./errors";

export type StorageProfileSummary = StorageProfileView & {
  objectCount: number;
  storedBytes: number;
};

export type StorageMigrationSummary = {
  id: string;
  kind: string;
  status: string;
  targetProfileName: string | null;
  processedCount: number;
  migratedCount: number;
  failedCount: number;
  totalBytes: number;
  cursor: string | null;
  updatedAt: Date;
};

export async function hasStorageProfileReferences(profileId: string): Promise<boolean> {
  const [result] = await db
    .select({ value: count() })
    .from(pageContent)
    .where(eq(pageContent.storageProfileId, profileId));
  return Number(result?.value ?? 0) > 0;
}

export async function listStorageProfileSummaries(): Promise<StorageProfileSummary[]> {
  let profiles = await listStorageProfiles();
  if (profiles.length === 0) {
    await ensureDefaultLocalStorageProfile();
    profiles = await listStorageProfiles();
  }
  return Promise.all(
    profiles.map(async (profile) => {
      const [usage] = await db
        .select({
          objectCount: count(),
          storedBytes: sql<number>`coalesce(sum(${pageContent.sizeBytes}), 0)`,
        })
        .from(pageContent)
        .where(eq(pageContent.storageProfileId, profile.id));
      return {
        ...profile,
        objectCount: Number(usage?.objectCount ?? 0),
        storedBytes: Number(usage?.storedBytes ?? 0),
      };
    }),
  );
}

export async function listStorageMigrationSummaries(): Promise<StorageMigrationSummary[]> {
  return db
    .select({
      id: storageMigration.id,
      kind: storageMigration.kind,
      status: storageMigration.status,
      targetProfileName: storageProfile.name,
      processedCount: storageMigration.processedCount,
      migratedCount: storageMigration.migratedCount,
      failedCount: storageMigration.failedCount,
      totalBytes: storageMigration.totalBytes,
      cursor: storageMigration.cursor,
      updatedAt: storageMigration.updatedAt,
    })
    .from(storageMigration)
    .leftJoin(storageProfile, eq(storageMigration.targetProfileId, storageProfile.id))
    .orderBy(desc(storageMigration.createdAt))
    .limit(20);
}

export async function testStorageProfileConnection(profileId: string): Promise<void> {
  const profile = await getStorageProfileWithCredentials(profileId);
  if (!profile) throw new StorageError("profile_not_found", "Storage profile not found");
  try {
    const store = await createContentStoreForProfile(profile);
    await store.testConnection();
    await recordStorageProfileHealth(profileId, { healthy: true });
  } catch (error) {
    const errorCode = error instanceof StorageError ? error.code : "storage_unavailable";
    await recordStorageProfileHealth(profileId, { healthy: false, errorCode });
    throw new StorageError("storage_unavailable", "Storage connection test failed");
  }
}
