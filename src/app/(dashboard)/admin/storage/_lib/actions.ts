"use server";

import { revalidatePath } from "next/cache";
import { getSession } from "@/lib/session";
import { isAdminEmail } from "@/lib/console";
import {
  createStorageProfile,
  deleteStorageProfile,
  setDefaultStorageProfile,
  setStorageProfileEnabled,
  updateStorageProfile,
} from "@/lib/storage/storage-profiles";
import {
  hasStorageProfileReferences,
  testStorageProfileConnection,
} from "@/lib/storage/admin";
import type { StorageProvider } from "@/lib/storage/contracts";
import type { StorageActionState } from "../_components/StorageClient";

async function requireAdmin() {
  const session = await getSession();
  if (!session || !isAdminEmail(session.user.email)) return null;
  return session;
}

function providerInput(data: FormData) {
  const provider = String(data.get("provider")) as StorageProvider;
  if (provider === "s3") {
    const endpoint = String(data.get("endpoint") ?? "").trim();
    const sessionToken = String(data.get("sessionToken") ?? "").trim();
    const accessKeyId = String(data.get("accessKeyId") ?? "").trim();
    const secretAccessKey = String(data.get("secretAccessKey") ?? "").trim();
    return {
      provider,
      config: {
        region: String(data.get("region") ?? "").trim(),
        bucket: String(data.get("bucket") ?? "").trim(),
        forcePathStyle: data.get("forcePathStyle") === "on",
        ...(endpoint ? { endpoint } : {}),
      },
      credentials:
        accessKeyId || secretAccessKey || sessionToken
          ? { accessKeyId, secretAccessKey, ...(sessionToken ? { sessionToken } : {}) }
          : undefined,
    };
  }
  if (provider === "vercel_blob") {
    const token = String(data.get("blobToken") ?? "").trim();
    return { provider, config: {}, credentials: token ? { token } : undefined };
  }
  return {
    provider,
    config: { rootPath: String(data.get("rootPath") ?? "").trim() },
    credentials: {},
  };
}

export async function saveStorageProfileAction(data: FormData): Promise<StorageActionState> {
  const actor = await requireAdmin();
  if (!actor) return { ok: false, error: "forbidden" };
  try {
    const parsed = providerInput(data);
    const id = String(data.get("id") ?? "");
    if (id) {
      await updateStorageProfile({
        id,
        name: String(data.get("name") ?? ""),
        config: parsed.config,
        credentials: parsed.credentials,
        actorUserId: actor.user.id,
      });
    } else {
      await createStorageProfile({
        name: String(data.get("name") ?? ""),
        provider: parsed.provider,
        config: parsed.config,
        credentials: parsed.credentials ?? {},
        actorUserId: actor.user.id,
      });
    }
    revalidatePath("/admin/storage");
    return { ok: true };
  } catch {
    return { ok: false, error: "save_failed" };
  }
}

export async function operateStorageProfileAction(data: FormData): Promise<StorageActionState> {
  const actor = await requireAdmin();
  if (!actor) return { ok: false, error: "forbidden" };
  const id = String(data.get("id") ?? "");
  try {
    switch (String(data.get("operation"))) {
      case "test":
        await testStorageProfileConnection(id);
        break;
      case "enable":
        await setStorageProfileEnabled(id, true, actor.user.id);
        break;
      case "disable":
        await setStorageProfileEnabled(id, false, actor.user.id);
        break;
      case "default":
        await setDefaultStorageProfile(id, actor.user.id);
        break;
      case "delete":
        await deleteStorageProfile(id, hasStorageProfileReferences);
        break;
      default:
        return { ok: false, error: "invalid_operation" };
    }
    revalidatePath("/admin/storage");
    return { ok: true };
  } catch {
    return { ok: false, error: "action_failed" };
  }
}
