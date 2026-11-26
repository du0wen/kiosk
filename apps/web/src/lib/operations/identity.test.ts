import { describe, expect, it } from "vitest";
import { SecretValue } from "@/lib/runtime-config";
import { hashOperationalIdentifier } from "./identity";

describe("hashOperationalIdentifier", () => {
  it("returns a deterministic non-reversible HMAC without the source value", () => {
    const secret = new SecretValue(Buffer.alloc(32, 9).toString("base64"));
    const first = hashOperationalIdentifier("org-sensitive-id", secret);
    const second = hashOperationalIdentifier("org-sensitive-id", secret);

    expect(first).toMatch(/^[a-f0-9]{64}$/);
    expect(first).toBe(second);
    expect(first).not.toContain("org-sensitive-id");
  });

  it("separates values and key domains", () => {
    const firstKey = new SecretValue(Buffer.alloc(32, 1).toString("base64"));
    const secondKey = new SecretValue(Buffer.alloc(32, 2).toString("base64"));
    expect(hashOperationalIdentifier("org-a", firstKey)).not.toBe(
      hashOperationalIdentifier("org-b", firstKey),
    );
    expect(hashOperationalIdentifier("org-a", firstKey)).not.toBe(
      hashOperationalIdentifier("org-a", secondKey),
    );
  });
});
