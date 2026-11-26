import { getTableConfig } from "drizzle-orm/pg-core";
import { describe, expect, it } from "vitest";
import { apiToken } from "./schema";

describe("api token lifecycle schema", () => {
  it("stores nullable legacy-compatible scopes and expiration", () => {
    const config = getTableConfig(apiToken);
    const scopes = config.columns.find((column) => column.name === "scopes");
    const expiresAt = config.columns.find((column) => column.name === "expires_at");
    expect(scopes?.notNull).toBe(false);
    expect(scopes?.getSQLType()).toBe("text[]");
    expect(expiresAt?.notNull).toBe(false);
    expect(config.indexes.map((index) => index.config.name)).toContain(
      "api_token_org_active_idx",
    );
  });
});
