import { chmod, mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, resolve, sep } from "node:path";
import { z } from "zod";

const oauthPairSchema = z.object({
  clientId: z.string().min(1),
  clientSecret: z.string().min(1),
});

export const kioskSetupConfigSchema = z.object({
  version: z.literal(1),
  setupCompleted: z.boolean(),
  completedAt: z.string().datetime(),
  auth: z.object({
    allowPublicSignup: z.boolean().default(false),
  }),
  origins: z.object({
    appOrigin: z.string().url(),
    serveOrigin: z.string().url(),
  }),
  database: z.object({
    url: z.string().min(1),
  }),
  storage: z.object({
    mode: z.enum(["database", "dual", "external"]),
    localDir: z.string().min(1),
  }),
  adminEmails: z.array(z.string().email()).min(1),
  secrets: z.object({
    betterAuth: z.string().min(16),
    storageCredential: z.string().min(16),
    rateLimitKey: z.string().min(16),
    operationsHash: z.string().min(16),
    renderShared: z.string().min(16),
  }),
  oauth: z.object({
    github: oauthPairSchema.nullable().default(null),
    google: oauthPairSchema.nullable().default(null),
  }),
});

export type KioskSetupConfig = z.infer<typeof kioskSetupConfigSchema>;

export function resolveSetupConfigPath(
  env: Record<string, string | undefined> = process.env,
  cwd: string = process.cwd(),
  home: string = homedir(),
): string {
  const configured = env.KIOSK_CONFIG_FILE?.trim();
  if (configured) return resolve(cwd, configured);
  return resolve(home, ".config", "kiosk", "kiosk.config.json");
}

export function assertStoragePathIsolatedFromConfig(
  storageDir: string,
  configFilePath: string = resolveSetupConfigPath(),
): void {
  const resolvedStorage = resolve(storageDir);
  const resolvedConfigFile = resolve(configFilePath);
  const resolvedConfigDir = dirname(resolvedConfigFile);

  if (
    resolvedStorage === resolvedConfigDir ||
    resolvedConfigFile.startsWith(`${resolvedStorage}${sep}`) ||
    resolvedStorage.startsWith(`${resolvedConfigDir}${sep}`)
  ) {
    throw new Error(
      "Local storage directory cannot overlap with the configuration file directory",
    );
  }
}

export async function readSetupConfig(
  filePath: string = resolveSetupConfigPath(),
): Promise<KioskSetupConfig | null> {
  try {
    const raw = await readFile(filePath, "utf8");
    const parsed = kioskSetupConfigSchema.safeParse(JSON.parse(raw));
    return parsed.success ? parsed.data : null;
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === "ENOENT") {
      return null;
    }
    return null;
  }
}

export async function writeSetupConfig(
  config: KioskSetupConfig,
  filePath: string = resolveSetupConfigPath(),
): Promise<void> {
  const validated = kioskSetupConfigSchema.parse(config);
  await mkdir(dirname(filePath), { recursive: true });
  const tempPath = `${filePath}.${process.pid}.${Date.now()}.tmp`;
  await writeFile(tempPath, `${JSON.stringify(validated, null, 2)}\n`, {
    encoding: "utf8",
    mode: 0o600,
  });
  await chmod(tempPath, 0o600);
  await rename(tempPath, filePath);
}

function setIfAbsent(
  env: Record<string, string | undefined>,
  key: string,
  value: string | undefined,
): void {
  if (!value) return;
  if (!env[key]?.trim()) {
    env[key] = value;
  }
}

export function applySetupConfigToEnv(
  config: KioskSetupConfig,
  env: Record<string, string | undefined> = process.env,
  options: { force?: boolean } = {},
): void {
  const assign = (key: string, value: string | undefined) => {
    if (!value) return;
    if (options.force || !env[key]?.trim()) {
      env[key] = value;
    }
  };

  assign("APP_ORIGIN", config.origins.appOrigin);
  assign("SERVE_ORIGIN", config.origins.serveOrigin);
  assign("BETTER_AUTH_URL", env.APP_ORIGIN?.trim() || config.origins.appOrigin);
  assign("NEXT_PUBLIC_APP_ORIGIN", env.APP_ORIGIN?.trim() || config.origins.appOrigin);
  assign("DATABASE_URL", config.database.url);
  assign("CONTENT_STORAGE_MODE", config.storage.mode);
  assign("STORAGE_LOCAL_DIR", config.storage.localDir);
  assign("KIOSK_ADMIN_EMAILS", config.adminEmails.join(","));
  assign("BETTER_AUTH_SECRET", config.secrets.betterAuth);
  assign("STORAGE_CREDENTIAL_KEY", config.secrets.storageCredential);
  assign("RATE_LIMIT_KEY_SECRET", config.secrets.rateLimitKey);
  assign("OPERATIONS_HASH_SECRET", config.secrets.operationsHash);
  assign("RENDER_SHARED_SECRET", config.secrets.renderShared);
  assign("KIOSK_ALLOW_PUBLIC_SIGNUP", config.auth.allowPublicSignup ? "true" : "false");

  if (config.oauth.github) {
    setIfAbsent(env, "GITHUB_CLIENT_ID", config.oauth.github.clientId);
    setIfAbsent(env, "GITHUB_CLIENT_SECRET", config.oauth.github.clientSecret);
  }
  if (config.oauth.google) {
    setIfAbsent(env, "GOOGLE_CLIENT_ID", config.oauth.google.clientId);
    setIfAbsent(env, "GOOGLE_CLIENT_SECRET", config.oauth.google.clientSecret);
  }

  if (config.setupCompleted) {
    env.KIOSK_SETUP_COMPLETED = "true";
  }
}

export function isSetupCompleted(
  env: Record<string, string | undefined> = process.env,
): boolean {
  if (env.KIOSK_SETUP_COMPLETED === "true") return true;
  return Boolean(env.DATABASE_URL?.trim() && env.BETTER_AUTH_SECRET?.trim());
}

export function isPublicSignupAllowed(
  env: Record<string, string | undefined> = process.env,
): boolean {
  const raw = env.KIOSK_ALLOW_PUBLIC_SIGNUP?.trim().toLowerCase();
  return raw === "true" || raw === "1";
}

export async function setPublicSignupAllowed(
  allowed: boolean,
  options: {
    filePath?: string;
    env?: Record<string, string | undefined>;
  } = {},
): Promise<void> {
  const env = options.env ?? process.env;
  const filePath = options.filePath ?? resolveSetupConfigPath(env);
  env.KIOSK_ALLOW_PUBLIC_SIGNUP = allowed ? "true" : "false";

  const existing = await readSetupConfig(filePath);
  if (existing) {
    await writeSetupConfig(
      {
        ...existing,
        auth: {
          ...existing.auth,
          allowPublicSignup: allowed,
        },
      },
      filePath,
    );
  }
}

export async function bootstrapSetupConfigFromDisk(
  env: Record<string, string | undefined> = process.env,
): Promise<KioskSetupConfig | null> {
  const config = await readSetupConfig(resolveSetupConfigPath(env));
  if (config) {
    applySetupConfigToEnv(config, env);
  }
  return config;
}

export async function isSetupCompletedLive(
  env: Record<string, string | undefined> = process.env,
): Promise<boolean> {
  if (isSetupCompleted(env)) return true;
  const loaded = await bootstrapSetupConfigFromDisk(env);
  return Boolean(loaded?.setupCompleted);
}

export function formatEnvFallbackSnippet(config: KioskSetupConfig): string {
  const lines = [
    `APP_ORIGIN=${config.origins.appOrigin}`,
    `SERVE_ORIGIN=${config.origins.serveOrigin}`,
    `BETTER_AUTH_URL=${config.origins.appOrigin}`,
    `NEXT_PUBLIC_APP_ORIGIN=${config.origins.appOrigin}`,
    `DATABASE_URL=${config.database.url}`,
    `CONTENT_STORAGE_MODE=${config.storage.mode}`,
    `STORAGE_LOCAL_DIR=${config.storage.localDir}`,
    `KIOSK_ADMIN_EMAILS=${config.adminEmails.join(",")}`,
    `KIOSK_ALLOW_PUBLIC_SIGNUP=${config.auth.allowPublicSignup ? "true" : "false"}`,
    `BETTER_AUTH_SECRET=${config.secrets.betterAuth}`,
    `STORAGE_CREDENTIAL_KEY=${config.secrets.storageCredential}`,
    `RATE_LIMIT_KEY_SECRET=${config.secrets.rateLimitKey}`,
    `OPERATIONS_HASH_SECRET=${config.secrets.operationsHash}`,
    `RENDER_SHARED_SECRET=${config.secrets.renderShared}`,
    `KIOSK_SETUP_COMPLETED=true`,
  ];
  if (config.oauth.github) {
    lines.push(`GITHUB_CLIENT_ID=${config.oauth.github.clientId}`);
    lines.push(`GITHUB_CLIENT_SECRET=${config.oauth.github.clientSecret}`);
  }
  if (config.oauth.google) {
    lines.push(`GOOGLE_CLIENT_ID=${config.oauth.google.clientId}`);
    lines.push(`GOOGLE_CLIENT_SECRET=${config.oauth.google.clientSecret}`);
  }
  return lines.join("\n");
}
