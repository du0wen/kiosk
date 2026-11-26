import { asc, eq } from "drizzle-orm";
import { db } from "@/db";
import { storageProfile, type StorageProfile } from "@/db/schema";
import {
  normalizeStorageConfig,
  normalizeStorageCredentials,
  type StorageEnvironment,
  type StorageProvider,
  type StorageProviderConfig,
  type StorageProviderCredentials,
  type StorageProfileStatus,
} from "./contracts";
import {
  decryptStorageCredentials,
  encryptStorageCredentials,
} from "./credentials";
import { StorageError, type StorageErrorCode } from "./errors";
import { resolveLocalStorageDir } from "./local-path";

export const DEFAULT_LOCAL_PROFILE_NAME = "Local Storage";

const EMPTY_FILESYSTEM_ENVELOPE = {
  credentialsCiphertext: "",
  credentialsIv: "",
  credentialsTag: "",
  credentialKeyVersion: 1,
} as const;

function encryptForProvider(
  provider: StorageProvider,
  credentials: StorageProviderCredentials,
) {
  if (provider === "filesystem") return EMPTY_FILESYSTEM_ENVELOPE;
  return encryptStorageCredentials(credentials);
}

function decryptForRow(row: StorageProfile): StorageProviderCredentials {
  if (row.provider === "filesystem") return {};
  return normalizeStorageCredentials(
    row.provider as StorageProvider,
    decryptStorageCredentials({
      credentialsCiphertext: row.credentialsCiphertext,
      credentialsIv: row.credentialsIv,
      credentialsTag: row.credentialsTag,
      credentialKeyVersion: row.credentialKeyVersion,
    }),
  );
}

export class StorageProfileError extends StorageError {
  constructor(code: StorageErrorCode, message: string) {
    super(code, message);
    this.name = "StorageProfileError";
  }
}

export type StorageProfileView = {
  id: string;
  name: string;
  provider: StorageProvider;
  config: StorageProviderConfig;
  enabled: boolean;
  isDefault: boolean;
  status: StorageProfileStatus;
  lastCheckedAt: Date | null;
  lastErrorCode: string | null;
  createdAt: Date;
  updatedAt: Date;
};

function view(row: StorageProfile): StorageProfileView {
  return {
    id: row.id,
    name: row.name,
    provider: row.provider as StorageProvider,
    config: row.config as StorageProviderConfig,
    enabled: row.enabled,
    isDefault: row.isDefault,
    status: row.status as StorageProfileStatus,
    lastCheckedAt: row.lastCheckedAt,
    lastErrorCode: row.lastErrorCode,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function profileName(value: string): string {
  const name = value.trim();
  if (!name || name.length > 80) {
    throw new StorageProfileError("invalid_configuration", "Profile name must be 1-80 characters");
  }
  return name;
}

function isUniqueViolation(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  if ("code" in error && error.code === "23505") return true;
  return "cause" in error && isUniqueViolation(error.cause);
}

async function profileRow(id: string): Promise<StorageProfile> {
  const [row] = await db
    .select()
    .from(storageProfile)
    .where(eq(storageProfile.id, id))
    .limit(1);
  if (!row) throw new StorageProfileError("profile_not_found", "Storage profile not found");
  return row;
}

export async function createStorageProfile(input: {
  name: string;
  provider: StorageProvider;
  config: unknown;
  credentials: unknown;
  actorUserId: string;
  environment?: StorageEnvironment;
}): Promise<StorageProfileView> {
  const config = normalizeStorageConfig(input.provider, input.config, input.environment);
  const credentials = normalizeStorageCredentials(input.provider, input.credentials);
  const encrypted = encryptForProvider(input.provider, credentials);
  try {
    const [row] = await db
      .insert(storageProfile)
      .values({
        name: profileName(input.name),
        provider: input.provider,
        config,
        ...encrypted,
        createdBy: input.actorUserId,
      })
      .returning();
    return view(row);
  } catch (error) {
    if (isUniqueViolation(error)) {
      throw new StorageProfileError("profile_name_conflict", "Storage profile name already exists");
    }
    throw error;
  }
}

export async function listStorageProfiles(): Promise<StorageProfileView[]> {
  const rows = await db.select().from(storageProfile).orderBy(asc(storageProfile.name));
  return rows.map(view);
}

export async function getStorageProfileWithCredentials(id: string): Promise<
  | (StorageProfileView & { credentials: StorageProviderCredentials })
  | null
> {
  const [row] = await db
    .select()
    .from(storageProfile)
    .where(eq(storageProfile.id, id))
    .limit(1);
  if (!row) return null;
  const credentials = decryptForRow(row);
  return { ...view(row), credentials };
}

export async function ensureDefaultLocalStorageProfile(
  rootPath: string = resolveLocalStorageDir(),
): Promise<StorageProfileView & { credentials: StorageProviderCredentials }> {
  const [existing] = await db
    .select()
    .from(storageProfile)
    .where(eq(storageProfile.isDefault, true))
    .limit(1);
  if (existing) {
    return { ...view(existing), credentials: decryptForRow(existing) };
  }

  const normalizedConfig = normalizeStorageConfig("filesystem", { rootPath });
  const now = new Date();
  await db
    .insert(storageProfile)
    .values({
      name: DEFAULT_LOCAL_PROFILE_NAME,
      provider: "filesystem",
      config: normalizedConfig,
      ...EMPTY_FILESYSTEM_ENVELOPE,
      enabled: true,
      isDefault: true,
      status: "healthy",
      lastCheckedAt: now,
      createdBy: null,
    })
    .onConflictDoNothing();

  const [resolved] = await db
    .select()
    .from(storageProfile)
    .where(eq(storageProfile.isDefault, true))
    .limit(1);
  if (resolved) {
    return { ...view(resolved), credentials: decryptForRow(resolved) };
  }

  throw new StorageProfileError(
    "profile_not_found",
    "Failed to initialize default local storage profile",
  );
}

export async function getDefaultStorageProfileWithCredentials(): Promise<
  | (StorageProfileView & { credentials: StorageProviderCredentials })
  | null
> {
  return ensureDefaultLocalStorageProfile();
}

export async function updateStorageProfile(input: {
  id: string;
  name: string;
  config: unknown;
  credentials?: unknown;
  actorUserId: string;
  environment?: StorageEnvironment;
}): Promise<StorageProfileView> {
  const existing = await profileRow(input.id);
  if (existing.enabled) {
    throw new StorageProfileError(
      "profile_enabled",
      "Disable the storage profile before editing its connection",
    );
  }
  const config = normalizeStorageConfig(
    existing.provider as StorageProvider,
    input.config,
    input.environment,
  );
  const secretPatch =
    input.credentials === undefined
      ? {}
      : encryptForProvider(
          existing.provider as StorageProvider,
          normalizeStorageCredentials(existing.provider as StorageProvider, input.credentials),
        );
  try {
    const [row] = await db
      .update(storageProfile)
      .set({
        name: profileName(input.name),
        config,
        ...secretPatch,
        status: "unverified",
        lastCheckedAt: null,
        lastErrorCode: null,
        updatedBy: input.actorUserId,
        updatedAt: new Date(),
      })
      .where(eq(storageProfile.id, input.id))
      .returning();
    return view(row);
  } catch (error) {
    if (isUniqueViolation(error)) {
      throw new StorageProfileError("profile_name_conflict", "Storage profile name already exists");
    }
    throw error;
  }
}

export async function recordStorageProfileHealth(
  id: string,
  result: { healthy: true } | { healthy: false; errorCode: string },
): Promise<StorageProfileView> {
  const [row] = await db
    .update(storageProfile)
    .set({
      status: result.healthy ? "healthy" : "unhealthy",
      lastCheckedAt: new Date(),
      lastErrorCode: result.healthy ? null : result.errorCode.slice(0, 80),
      updatedAt: new Date(),
    })
    .where(eq(storageProfile.id, id))
    .returning();
  if (!row) throw new StorageProfileError("profile_not_found", "Storage profile not found");
  return view(row);
}

export async function setStorageProfileEnabled(
  id: string,
  enabled: boolean,
  actorUserId: string,
): Promise<StorageProfileView> {
  const existing = await profileRow(id);
  if (enabled && existing.status !== "healthy") {
    throw new StorageProfileError("profile_unhealthy", "Test the storage profile before enabling it");
  }
  if (!enabled && existing.isDefault) {
    throw new StorageProfileError("profile_is_default", "Default storage cannot be disabled");
  }
  const [row] = await db
    .update(storageProfile)
    .set({ enabled, updatedBy: actorUserId, updatedAt: new Date() })
    .where(eq(storageProfile.id, id))
    .returning();
  return view(row);
}

export async function setDefaultStorageProfile(
  id: string,
  actorUserId: string,
): Promise<StorageProfileView> {
  return db.transaction(async (tx) => {
    const [existing] = await tx
      .select()
      .from(storageProfile)
      .where(eq(storageProfile.id, id))
      .limit(1);
    if (!existing) {
      throw new StorageProfileError("profile_not_found", "Storage profile not found");
    }
    if (!existing.enabled || existing.status !== "healthy") {
      throw new StorageProfileError("profile_unhealthy", "Default storage must be healthy and enabled");
    }
    await tx
      .update(storageProfile)
      .set({ isDefault: false, updatedAt: new Date() })
      .where(eq(storageProfile.isDefault, true));
    const [row] = await tx
      .update(storageProfile)
      .set({ isDefault: true, updatedBy: actorUserId, updatedAt: new Date() })
      .where(eq(storageProfile.id, id))
      .returning();
    return view(row);
  });
}

export async function deleteStorageProfile(
  id: string,
  hasReferences: (profileId: string) => Promise<boolean>,
): Promise<boolean> {
  const existing = await profileRow(id);
  if (existing.isDefault) {
    throw new StorageProfileError("profile_is_default", "Default storage cannot be deleted");
  }
  if (await hasReferences(id)) {
    throw new StorageProfileError("profile_referenced", "Referenced storage cannot be deleted");
  }
  const [deleted] = await db
    .delete(storageProfile)
    .where(eq(storageProfile.id, id))
    .returning({ id: storageProfile.id });
  return !!deleted;
}
