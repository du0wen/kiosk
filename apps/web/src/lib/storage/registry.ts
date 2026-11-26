import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import type {
  FilesystemStorageConfig,
  S3StorageConfig,
  S3StorageCredentials,
  StorageProvider,
  StorageProviderCredentials,
  VercelBlobStorageCredentials,
} from "./contracts";
import { StorageConfigError } from "./contracts";
import type { ContentStore } from "./content-store";
import { FilesystemContentStore } from "./adapters/filesystem";
import { S3ContentStore } from "./adapters/s3";
import { VercelBlobContentStore } from "./adapters/vercel-blob";
import {
  getStorageProfileWithCredentials,
  type StorageProfileView,
} from "./storage-profiles";
import { StorageError } from "./errors";

export type ResolvedStorageProfile = StorageProfileView & {
  credentials: StorageProviderCredentials;
};

type ProviderFactory = (profile: ResolvedStorageProfile) => ContentStore | Promise<ContentStore>;
type ProviderFactories = Partial<Record<StorageProvider, ProviderFactory>>;
type LookupResult = { address: string; family: number };
type LookupAll = (hostname: string) => Promise<LookupResult[]>;

function isPrivateIpv4(address: string): boolean {
  const [a, b] = address.split(".").map(Number);
  return (
    a === 0 ||
    a === 10 ||
    a === 127 ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 100 && b >= 64 && b <= 127)
  );
}

function isPrivateAddress(address: string): boolean {
  const normalized = address.toLowerCase();
  const version = isIP(normalized);
  if (version === 4) return isPrivateIpv4(normalized);
  if (version === 6) {
    return (
      normalized === "::" ||
      normalized === "::1" ||
      normalized.startsWith("fc") ||
      normalized.startsWith("fd") ||
      /^fe[89ab]/.test(normalized) ||
      normalized.startsWith("::ffff:10.") ||
      normalized.startsWith("::ffff:127.") ||
      normalized.startsWith("::ffff:192.168.")
    );
  }
  return true;
}

const systemLookup: LookupAll = async (hostname) => {
  const results = await lookup(hostname, { all: true, verbatim: true });
  return results.map(({ address, family }) => ({ address, family }));
};

export async function assertPublicEndpointResolution(
  endpoint: string,
  resolveAll: LookupAll = systemLookup,
): Promise<void> {
  let hostname: string;
  try {
    hostname = new URL(endpoint).hostname;
  } catch {
    throw new StorageConfigError("Invalid storage endpoint");
  }
  let addresses: LookupResult[];
  try {
    addresses = await resolveAll(hostname);
  } catch {
    throw new StorageConfigError("Storage endpoint DNS lookup failed");
  }
  if (!addresses.length || addresses.some(({ address }) => isPrivateAddress(address))) {
    throw new StorageConfigError("Storage endpoint resolves to a private address");
  }
}

const defaultFactories: Required<ProviderFactories> = {
  s3(profile) {
    const config = profile.config as S3StorageConfig;
    const credentials = profile.credentials as S3StorageCredentials;
    return new S3ContentStore({
      bucket: config.bucket,
      clientConfig: {
        region: config.region,
        forcePathStyle: config.forcePathStyle,
        ...(config.endpoint ? { endpoint: config.endpoint } : {}),
        credentials,
      },
    });
  },
  vercel_blob(profile) {
    const credentials = profile.credentials as VercelBlobStorageCredentials;
    return new VercelBlobContentStore({ token: credentials.token });
  },
  filesystem(profile) {
    const config = profile.config as FilesystemStorageConfig;
    return new FilesystemContentStore(config.rootPath);
  },
};

export async function createContentStoreForProfile(
  profile: ResolvedStorageProfile,
  factories: ProviderFactories = defaultFactories,
): Promise<ContentStore> {
  if (
    profile.provider === "s3" &&
    process.env.NODE_ENV === "production" &&
    (profile.config as S3StorageConfig).endpoint
  ) {
    await assertPublicEndpointResolution((profile.config as S3StorageConfig).endpoint!);
  }
  const factory = factories[profile.provider];
  if (!factory) throw new StorageConfigError("Unknown storage provider");
  return factory(profile);
}

export async function createContentStore(
  profileId: string,
  dependencies: {
    loadProfile?: (id: string) => Promise<ResolvedStorageProfile | null>;
    factories?: ProviderFactories;
  } = {},
): Promise<ContentStore> {
  const profile = await (dependencies.loadProfile ?? getStorageProfileWithCredentials)(profileId);
  if (!profile) throw new StorageError("profile_not_found", "Storage profile not found");
  return createContentStoreForProfile(profile, dependencies.factories);
}
