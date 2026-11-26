import { and, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { pageContent } from "@/db/schema";
import type { ListedContentObject } from "./content-store";
import { StorageError } from "./errors";
import { createContentStoreForProfile } from "./registry";
import { getStorageProfileWithCredentials } from "./storage-profiles";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export type OrphanCleanupOptions = {
  command: "orphan-report" | "orphan-delete";
  profileId: string;
  safetyAgeHours: number;
  limit: number;
  cursor: string | null;
  deleteObjects: boolean;
  confirmed: boolean;
};

export function classifyOrphans(
  objects: ListedContentObject[],
  referencedKeys: Set<string>,
  safetyAgeHours: number,
  now = new Date(),
): ListedContentObject[] {
  const cutoff = now.getTime() - safetyAgeHours * 60 * 60 * 1000;
  return objects.filter((object) =>
    object.modifiedAt !== null &&
    object.modifiedAt.getTime() <= cutoff &&
    !referencedKeys.has(object.key));
}

export function parseOrphanCleanupArgs(args: string[]): OrphanCleanupOptions {
  const command = args[0];
  if (command !== "orphan-report" && command !== "orphan-delete") {
    throw new Error("Expected orphan-report or orphan-delete");
  }
  let profileId = "";
  let safetyAgeHours = 168;
  let limit = 100;
  let cursor: string | null = null;
  let confirmed = false;
  for (let index = 1; index < args.length; index += 1) {
    const value = args[index];
    if (value === "--profile") profileId = args[++index] ?? "";
    else if (value === "--safety-hours") safetyAgeHours = Number(args[++index]);
    else if (value === "--limit") limit = Number(args[++index]);
    else if (value === "--cursor") cursor = args[++index] ?? null;
    else if (value === "--confirm") {
      if (args[++index] !== "DELETE_ORPHAN_OBJECTS") {
        throw new Error("--confirm must equal DELETE_ORPHAN_OBJECTS");
      }
      confirmed = true;
    } else throw new Error(`Unknown argument: ${value}`);
  }
  if (!UUID_PATTERN.test(profileId)) throw new Error("--profile must be a UUID");
  if (!Number.isInteger(safetyAgeHours) || safetyAgeHours < 24) {
    throw new Error("--safety-hours must be at least 24");
  }
  if (!Number.isInteger(limit) || limit < 1 || limit > 500) {
    throw new Error("--limit must be between 1 and 500");
  }
  if (command === "orphan-delete" && !confirmed) {
    throw new Error("orphan-delete requires --confirm DELETE_ORPHAN_OBJECTS");
  }
  if (command === "orphan-report" && confirmed) {
    throw new Error("orphan-report does not accept --confirm");
  }
  return {
    command,
    profileId,
    safetyAgeHours,
    limit,
    cursor,
    deleteObjects: command === "orphan-delete",
    confirmed,
  };
}

export async function scanOrphanObjects(
  options: OrphanCleanupOptions,
): Promise<{
  listedCount: number;
  orphanCount: number;
  orphanBytes: number;
  deletedCount: number;
  failedCount: number;
  cursor: string | null;
}> {
  if (options.deleteObjects && !options.confirmed) {
    throw new StorageError("invalid_configuration", "Orphan deletion requires confirmation");
  }
  const profile = await getStorageProfileWithCredentials(options.profileId);
  if (!profile) throw new StorageError("profile_not_found", "Storage profile not found");
  const store = await createContentStoreForProfile(profile);
  if (!store.list) {
    throw new StorageError("invalid_configuration", "Storage provider does not support object listing");
  }
  const listed = await store.list({
    prefix: "organizations/",
    cursor: options.cursor ?? undefined,
    limit: options.limit,
  });
  const keys = listed.objects.map((object) => object.key);
  const references = keys.length === 0 ? [] : await db
    .select({ key: pageContent.objectKey })
    .from(pageContent)
    .where(and(
      eq(pageContent.storageProfileId, options.profileId),
      inArray(pageContent.objectKey, keys),
    ));
  const orphans = classifyOrphans(
    listed.objects,
    new Set(references.map((reference) => reference.key)),
    options.safetyAgeHours,
  );
  let deletedCount = 0;
  let failedCount = 0;
  if (options.deleteObjects) {
    for (const orphan of orphans) {
      try {
        const [freshReference] = await db
          .select({ id: pageContent.id })
          .from(pageContent)
          .where(and(
            eq(pageContent.storageProfileId, options.profileId),
            eq(pageContent.objectKey, orphan.key),
          ))
          .limit(1);
        if (freshReference) continue;
        await store.delete(orphan.key);
        deletedCount += 1;
      } catch {
        failedCount += 1;
      }
    }
  }
  return {
    listedCount: listed.objects.length,
    orphanCount: orphans.length,
    orphanBytes: orphans.reduce((sum, object) => sum + object.sizeBytes, 0),
    deletedCount,
    failedCount,
    cursor: listed.cursor,
  };
}
