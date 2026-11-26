-- Custom SQL migration file, put your code below! --

-- The `kiosk-cli` OAuth client is configured in code as a trusted PUBLIC client
-- (src/lib/auth.ts oidcProvider.trustedClients). Better Auth resolves it without a
-- DB lookup, BUT oauth_access_token.client_id has a FK to oauth_application.client_id,
-- and the token endpoint writes client_id = 'kiosk-cli' on every login. This row exists
-- ONLY to satisfy that FK; its columns are never read (the in-code trusted client wins).
INSERT INTO "oauth_application"
  ("id", "client_id", "name", "type", "redirect_urls", "disabled", "created_at", "updated_at")
VALUES (
  'kiosk-cli',
  'kiosk-cli',
  'Kiosk CLI',
  'public',
  'http://127.0.0.1:8976/callback,http://127.0.0.1:8977/callback,http://127.0.0.1:8978/callback',
  false,
  now(),
  now()
)
ON CONFLICT ("client_id") DO NOTHING;
