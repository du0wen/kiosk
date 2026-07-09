import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { organization, oidcProvider } from "better-auth/plugins";
import { db } from "../db";
import * as schema from "../db/schema";

export const auth = betterAuth({
  baseURL: process.env.BETTER_AUTH_URL,
  secret: process.env.BETTER_AUTH_SECRET,
  database: drizzleAdapter(db, { provider: "pg", schema }),
  socialProviders: {
    github: {
      clientId: process.env.GITHUB_CLIENT_ID!,
      clientSecret: process.env.GITHUB_CLIENT_SECRET!,
    },
    google: {
      clientId: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
    },
  },
  advanced: {
    // Host-only, __Host- prefixed cookies: never shared with SERVE_ORIGIN.
    cookiePrefix: "__Host-kiosk",
    useSecureCookies: true,
  },
  databaseHooks: {
    user: {
      create: {
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
  },
  plugins: [
    organization(),
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
          clientSecret: process.env.BETTER_AUTH_SECRET!,
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

export type Auth = typeof auth;
