import { NextResponse } from "next/server";
import { assertStoragePathIsolatedFromConfig } from "@/lib/setup/config-file";
import { requireSetupSession } from "@/lib/setup/guard";
import {
  normalizeStorageConfig,
  normalizeStorageCredentials,
  type StorageProvider,
} from "@/lib/storage/contracts";
import { resolveLocalStorageDir } from "@/lib/storage/local-path";
import { createContentStoreForProfile } from "@/lib/storage/registry";

export async function POST(req: Request): Promise<NextResponse> {
  const denied = await requireSetupSession();
  if (denied) return denied;

  let body: {
    provider?: unknown;
    config?: Record<string, unknown>;
    credentials?: Record<string, unknown>;
  };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON payload" }, { status: 400 });
  }

  const provider = body.provider as StorageProvider;
  try {
    const rawConfig =
      provider === "filesystem"
        ? {
            rootPath: resolveLocalStorageDir({
              STORAGE_LOCAL_DIR:
                typeof body.config?.rootPath === "string" ? body.config.rootPath : "",
            }),
          }
        : (body.config ?? {});
    const config = normalizeStorageConfig(provider, rawConfig);
    if (provider === "filesystem") {
      assertStoragePathIsolatedFromConfig((config as { rootPath: string }).rootPath);
    }
    const credentials = normalizeStorageCredentials(
      provider,
      provider === "filesystem" ? {} : (body.credentials ?? {}),
    );

    const store = await createContentStoreForProfile({
      id: "setup-probe",
      name: "Setup Probe",
      provider,
      config,
      credentials,
      enabled: true,
      isDefault: true,
      status: "unverified",
      lastCheckedAt: null,
      lastErrorCode: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    await store.testConnection();
    return NextResponse.json({ ok: true, config });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Storage connection test failed";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
