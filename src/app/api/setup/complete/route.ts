import { randomBytes } from "node:crypto";
import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { getDomain } from "tldts";
import { z } from "zod";
import { db, resetDbConnection } from "@/db";
import { organization } from "@/db/schema";
import { auth, resetAuthInstance } from "@/lib/auth";
import { resolveUserOrg } from "@/lib/console";
import {
  applySetupConfigToEnv,
  assertStoragePathIsolatedFromConfig,
  formatEnvFallbackSnippet,
  resolveSetupConfigPath,
  writeSetupConfig,
  type KioskSetupConfig,
} from "@/lib/setup/config-file";
import { requireSetupSession } from "@/lib/setup/guard";
import { runDatabaseMigrations, validateDatabaseUrl } from "@/lib/setup/migrator";
import { resolveLocalStorageDir } from "@/lib/storage/local-path";
import {
  createStorageProfile,
  ensureDefaultLocalStorageProfile,
  recordStorageProfileHealth,
  setDefaultStorageProfile,
  setStorageProfileEnabled,
} from "@/lib/storage/storage-profiles";

const completeSchema = z.object({
  appOrigin: z.string().url(),
  serveOrigin: z.string().url(),
  databaseUrl: z.string().min(1),
  allowPublicSignup: z.boolean().default(false),
  storage: z.discriminatedUnion("provider", [
    z.object({
      provider: z.literal("filesystem"),
      localDir: z.string().optional().default(""),
    }),
    z.object({
      provider: z.literal("s3"),
      name: z.string().min(1).max(80).default("Primary S3 Storage"),
      config: z.object({
        endpoint: z.string().optional(),
        region: z.string().min(1),
        bucket: z.string().min(1),
        forcePathStyle: z.boolean().optional().default(false),
      }),
      credentials: z.object({
        accessKeyId: z.string().min(1),
        secretAccessKey: z.string().min(1),
        sessionToken: z.string().optional(),
      }),
    }),
    z.object({
      provider: z.literal("vercel_blob"),
      name: z.string().min(1).max(80).default("Vercel Blob Storage"),
      credentials: z.object({
        token: z.string().min(1),
      }),
    }),
  ]),
  admin: z.object({
    name: z.string().trim().min(1).max(100),
    email: z.string().trim().email(),
    password: z.string().min(12, "Password must be at least 12 characters"),
    workspaceName: z.string().trim().min(1).max(80).optional(),
  }),
  oauth: z
    .object({
      github: z
        .object({
          clientId: z.string().trim().min(1),
          clientSecret: z.string().trim().min(1),
        })
        .nullable()
        .optional(),
      google: z
        .object({
          clientId: z.string().trim().min(1),
          clientSecret: z.string().trim().min(1),
        })
        .nullable()
        .optional(),
    })
    .optional(),
});

function genSecret(existing?: string): string {
  const trimmed = existing?.trim();
  if (trimmed && trimmed.length >= 32) return trimmed;
  return randomBytes(32).toString("base64");
}

function validateOriginPair(appOrigin: string, serveOrigin: string): string | null {
  const app = new URL(appOrigin);
  const serve = new URL(serveOrigin);
  if (app.origin === serve.origin) {
    return "APP_ORIGIN and SERVE_ORIGIN must be different origins";
  }
  if (process.env.NODE_ENV === "production") {
    if (app.protocol !== "https:" || serve.protocol !== "https:") {
      return "APP_ORIGIN and SERVE_ORIGIN must use HTTPS in production";
    }
    const appDomain = getDomain(app.hostname);
    const serveDomain = getDomain(serve.hostname);
    if (appDomain && serveDomain && appDomain === serveDomain) {
      return "APP_ORIGIN and SERVE_ORIGIN must be two separate registrable domains in production";
    }
  }
  return null;
}

export async function POST(req: Request): Promise<NextResponse> {
  const denied = await requireSetupSession();
  if (denied) return denied;

  let rawBody: unknown;
  try {
    rawBody = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON payload" }, { status: 400 });
  }

  const parsed = completeSchema.safeParse(rawBody);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid setup configuration" },
      { status: 400 },
    );
  }

  const input = parsed.data;
  const originError = validateOriginPair(input.appOrigin, input.serveOrigin);
  if (originError) {
    return NextResponse.json({ error: originError }, { status: 400 });
  }

  try {
    const databaseUrl = validateDatabaseUrl(input.databaseUrl);
    await runDatabaseMigrations(databaseUrl);

    const localDir =
      input.storage.provider === "filesystem"
        ? resolveLocalStorageDir({ STORAGE_LOCAL_DIR: input.storage.localDir })
        : resolveLocalStorageDir();

    if (input.storage.provider === "filesystem") {
      assertStoragePathIsolatedFromConfig(localDir);
    }

    const setupConfig: KioskSetupConfig = {
      version: 1,
      setupCompleted: true,
      completedAt: new Date().toISOString(),
      auth: {
        allowPublicSignup: input.allowPublicSignup,
      },
      origins: {
        appOrigin: new URL(input.appOrigin).origin,
        serveOrigin: new URL(input.serveOrigin).origin,
      },
      database: {
        url: databaseUrl,
      },
      storage: {
        mode: "external",
        localDir,
      },
      adminEmails: [input.admin.email.toLowerCase()],
      secrets: {
        betterAuth: genSecret(process.env.BETTER_AUTH_SECRET),
        storageCredential: genSecret(process.env.STORAGE_CREDENTIAL_KEY),
        rateLimitKey: genSecret(process.env.RATE_LIMIT_KEY_SECRET),
        operationsHash: genSecret(process.env.OPERATIONS_HASH_SECRET),
        renderShared: genSecret(process.env.RENDER_SHARED_SECRET),
      },
      oauth: {
        github: input.oauth?.github ?? null,
        google: input.oauth?.google ?? null,
      },
    };

    // Apply config to runtime env and hot-reload DB & Better Auth.
    applySetupConfigToEnv(setupConfig, process.env, { force: true });
    await resetDbConnection();
    resetAuthInstance();

    // Create initial super-admin account via Better Auth.
    const created = await auth.api.signUpEmail({
      body: {
        name: input.admin.name,
        email: input.admin.email.toLowerCase(),
        password: input.admin.password,
      },
    });
    const adminUserId = created.user.id;

    // Rename default personal workspace if requested.
    if (input.admin.workspaceName) {
      const orgId = await resolveUserOrg(adminUserId);
      if (orgId) {
        await db
          .update(organization)
          .set({ name: input.admin.workspaceName })
          .where(eq(organization.id, orgId));
      }
    }

    // Initialize selected storage profile.
    if (input.storage.provider === "filesystem") {
      await ensureDefaultLocalStorageProfile(localDir);
    } else if (input.storage.provider === "s3") {
      const profile = await createStorageProfile({
        name: input.storage.name,
        provider: "s3",
        config: input.storage.config,
        credentials: input.storage.credentials,
        actorUserId: adminUserId,
      });
      await recordStorageProfileHealth(profile.id, { healthy: true });
      await setStorageProfileEnabled(profile.id, true, adminUserId);
      await setDefaultStorageProfile(profile.id, adminUserId);
    } else {
      const profile = await createStorageProfile({
        name: input.storage.name,
        provider: "vercel_blob",
        config: {},
        credentials: input.storage.credentials,
        actorUserId: adminUserId,
      });
      await recordStorageProfileHealth(profile.id, { healthy: true });
      await setStorageProfileEnabled(profile.id, true, adminUserId);
      await setDefaultStorageProfile(profile.id, adminUserId);
    }

    // Persist kiosk.config.json atomically (fallback to env snippet on read-only FS).
    let persistedToDisk = true;
    let envSnippet: string | undefined;
    const configPath = resolveSetupConfigPath();
    try {
      await writeSetupConfig(setupConfig, configPath);
    } catch {
      persistedToDisk = false;
      envSnippet = formatEnvFallbackSnippet(setupConfig);
    }

    return NextResponse.json({
      ok: true,
      persistedToDisk,
      configPath: persistedToDisk ? configPath : undefined,
      envSnippet,
    });
  } catch (error) {
    // Roll back completion flag on error so user can retry cleanly.
    delete process.env.KIOSK_SETUP_COMPLETED;
    const message = error instanceof Error ? error.message : "Setup failed";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
