import { betterAuth } from "better-auth";
import { APIError } from "better-auth/api";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { organization, oidcProvider } from "better-auth/plugins";
import { and, count, eq, gt } from "drizzle-orm";
import { db } from "../db";
import * as schema from "../db/schema";
import { createBetterAuthRateLimitStorage } from "./protection/better-auth";
import { getProtectionRuntime } from "./protection/runtime";
import { isPublicSignupAllowed } from "./setup/config-file";
import { evaluateUserSignupPolicy } from "./setup/signup-policy";

function buildAuth() {
  const protection = getProtectionRuntime();
  const authRateLimit = protection.policy.rateLimits.authPost;

  const socialProviders: {
    github?: { clientId: string; clientSecret: string };
    google?: { clientId: string; clientSecret: string };
  } = {};

  if (process.env.GITHUB_CLIENT_ID?.trim() && process.env.GITHUB_CLIENT_SECRET?.trim()) {
    socialProviders.github = {
      clientId: process.env.GITHUB_CLIENT_ID.trim(),
      clientSecret: process.env.GITHUB_CLIENT_SECRET.trim(),
    };
  }
  if (process.env.GOOGLE_CLIENT_ID?.trim() && process.env.GOOGLE_CLIENT_SECRET?.trim()) {
    socialProviders.google = {
      clientId: process.env.GOOGLE_CLIENT_ID.trim(),
      clientSecret: process.env.GOOGLE_CLIENT_SECRET.trim(),
    };
  }

  return betterAuth({
    baseURL: process.env.BETTER_AUTH_URL,
    secret: process.env.BETTER_AUTH_SECRET,
    database: drizzleAdapter(db, { provider: "pg", schema }),
    emailAndPassword: {
      enabled: true,
    },
    socialProviders,
    advanced: {
      // Host-only, __Host- prefixed cookies: never shared with SERVE_ORIGIN.
      cookiePrefix: "__Host-kiosk",
      useSecureCookies: process.env.NODE_ENV === "production",
      ipAddress: {
        ipAddressHeaders: protection.trustedClientIpHeaders,
      },
    },
    rateLimit: {
      enabled: true,
      window: authRateLimit.windowSeconds,
      max: authRateLimit.limit,
      customRules: {
        "*": (request) =>
          request.method === "POST"
            ? { window: authRateLimit.windowSeconds, max: authRateLimit.limit }
            : false,
      },
      customStorage: createBetterAuthRateLimitStorage(
        protection.store,
        protection.keySecret,
      ),
    },
    databaseHooks: {
      user: {
        create: {
          before: async (createdUser) => {
            const allowPublicSignup = isPublicSignupAllowed();
            if (allowPublicSignup) return { data: createdUser };

            const [userCountRow] = await db
              .select({ value: count() })
              .from(schema.user);
            const existingUserCount = Number(userCountRow?.value ?? 0);

            let hasValidInvitation = false;
            if (existingUserCount > 0 && createdUser.email) {
              const [inv] = await db
                .select({ id: schema.invitation.id })
                .from(schema.invitation)
                .where(
                  and(
                    eq(schema.invitation.email, createdUser.email.toLowerCase()),
                    eq(schema.invitation.status, "pending"),
                    gt(schema.invitation.expiresAt, new Date()),
                  ),
                )
                .limit(1);
              hasValidInvitation = Boolean(inv);
            }

            const decision = evaluateUserSignupPolicy({
              allowPublicSignup,
              existingUserCount,
              hasValidInvitation,
            });
            if (!decision.allowed) {
              throw new APIError("FORBIDDEN", { message: decision.reason });
            }
            return { data: createdUser };
          },
          after: async (createdUser) => {
            // Dynamic import avoids a load-time cycle (org.ts imports db).
            const { provisionPersonalOrg } = await import("./org");
            await provisionPersonalOrg(
              createdUser.id,
              createdUser.name ?? createdUser.email,
            );
          },
        },
      },
      session: {
        create: {
          before: async (session) => {
            // Default the active org to the user's personal org so org-scoped ops
            // + the console have a current org immediately after login.
            const { resolveUserOrg } = await import("./console");
            const org = await resolveUserOrg(session.userId);
            return {
              data: { ...session, activeOrganizationId: org ?? undefined },
            };
          },
        },
      },
    },
    plugins: [
      organization({
        membershipLimit: protection.policy.quotas.members,
        invitationLimit: protection.policy.quotas.invitations,
      }),
      // Kiosk is its own OAuth/OIDC provider for the CLI. The `kiosk-cli` client is a
      // trusted PUBLIC client: authorization-code + PKCE + loopback, consent skipped.
      oidcProvider({
        loginPage: "/sign-in", // no session → redirected here with the original oauth query
        trustedClients: [
          {
            clientId: "kiosk-cli",
            // `type: "public"` ⇒ the CLI authenticates via PKCE and never sends a secret.
            // A non-empty secret is still required because the token endpoint always signs
            // an id_token, and jose rejects a zero-length HMAC key. This value signs only
            // the (unused) id_token; it is never sent by or verified against the CLI.
            clientSecret: process.env.BETTER_AUTH_SECRET || "setup-placeholder-secret",
            type: "public",
            name: "Kiosk CLI",
            disabled: false,
            metadata: null,
            // Better Auth matches redirect_uri exactly (no RFC 8252 port flexibility), so
            // the CLI binds the first free port among these fixed candidates.
            redirectUrls: [
              "http://127.0.0.1:8976/callback",
              "http://127.0.0.1:8977/callback",
              "http://127.0.0.1:8978/callback",
            ],
            skipConsent: true,
          },
        ],
      }),
    ],
  });
}

export type Auth = ReturnType<typeof buildAuth>;

let activeAuth: Auth | null = null;

export function getAuth(): Auth {
  if (!activeAuth) {
    activeAuth = buildAuth();
  }
  return activeAuth;
}

export function resetAuthInstance(): void {
  activeAuth = null;
}

export const auth: Auth = new Proxy({} as Auth, {
  get(_target, prop, receiver) {
    const instance = getAuth();
    const value = Reflect.get(instance, prop, receiver);
    return typeof value === "function" ? value.bind(instance) : value;
  },
  has(_target, prop) {
    return prop in getAuth();
  },
});
