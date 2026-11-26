export const RATE_LIMIT_NAMES = [
  "authPost",
  "cliMintPreAuth",
  "cliMintPostAuth",
  "apiPreAuth",
  "apiGeneral",
  "apiWrite",
  "apiExport",
  "report",
  "renderDaily",
] as const;

export const QUOTA_NAMES = [
  "activePages",
  "retainedBytes",
  "activeTokens",
  "members",
  "invitations",
  "renderConcurrency",
] as const;

export type RateLimitName = (typeof RATE_LIMIT_NAMES)[number];
export type QuotaName = (typeof QUOTA_NAMES)[number];

export type ProtectionPolicy = {
  rateLimits: Record<RateLimitName, { limit: number; windowSeconds: number }>;
  quotas: Record<QuotaName, number>;
};

const defaults: ProtectionPolicy = {
  rateLimits: {
    authPost: { limit: 20, windowSeconds: 600 },
    cliMintPreAuth: { limit: 10, windowSeconds: 600 },
    cliMintPostAuth: { limit: 5, windowSeconds: 3_600 },
    apiPreAuth: { limit: 120, windowSeconds: 60 },
    apiGeneral: { limit: 120, windowSeconds: 60 },
    apiWrite: { limit: 30, windowSeconds: 60 },
    apiExport: { limit: 10, windowSeconds: 60 },
    report: { limit: 5, windowSeconds: 3_600 },
    renderDaily: { limit: 100, windowSeconds: 86_400 },
  },
  quotas: {
    activePages: 500,
    retainedBytes: 1024 ** 3,
    activeTokens: 25,
    members: 25,
    invitations: 25,
    renderConcurrency: 2,
  },
};

function deepFreeze<T extends object>(value: T): Readonly<T> {
  for (const nested of Object.values(value)) {
    if (nested && typeof nested === "object") deepFreeze(nested);
  }
  return Object.freeze(value);
}

export const DEFAULT_PROTECTION_POLICY: Readonly<ProtectionPolicy> = deepFreeze(defaults);

type Env = Record<string, string | undefined>;

export class ProtectionPolicyError extends Error {
  constructor(public readonly variable: string) {
    super(`Invalid positive integer for ${variable}`);
    this.name = "ProtectionPolicyError";
  }
}

function snakeCase(value: string): string {
  return value.replace(/[A-Z]/g, (letter) => `_${letter}`).toUpperCase();
}

function positiveInteger(env: Env, name: string, fallback: number): number {
  const raw = env[name]?.trim();
  if (raw === undefined || raw === "") {
    if (env[name] !== undefined) throw new ProtectionPolicyError(name);
    return fallback;
  }
  const parsed = Number(raw);
  if (!Number.isSafeInteger(parsed) || parsed <= 0) {
    throw new ProtectionPolicyError(name);
  }
  return parsed;
}

export function loadProtectionPolicy(env: Env = process.env): ProtectionPolicy {
  const rateLimits = Object.fromEntries(
    RATE_LIMIT_NAMES.map((name) => {
      const prefix = `KIOSK_RATE_${snakeCase(name)}`;
      const fallback = DEFAULT_PROTECTION_POLICY.rateLimits[name];
      return [
        name,
        {
          limit: positiveInteger(env, `${prefix}_LIMIT`, fallback.limit),
          windowSeconds: positiveInteger(
            env,
            `${prefix}_WINDOW_SECONDS`,
            fallback.windowSeconds,
          ),
        },
      ];
    }),
  ) as ProtectionPolicy["rateLimits"];

  const quotas = Object.fromEntries(
    QUOTA_NAMES.map((name) => [
      name,
      positiveInteger(
        env,
        `KIOSK_QUOTA_${snakeCase(name)}`,
        DEFAULT_PROTECTION_POLICY.quotas[name],
      ),
    ]),
  ) as ProtectionPolicy["quotas"];

  return { rateLimits, quotas };
}
