-- Replace legacy plaintext-derived display prefixes with non-secret hash
-- fingerprints. The physical column name is retained for compatibility.
UPDATE "api_token"
SET "token_prefix" = substring("token_hash" FROM 1 FOR 12);
