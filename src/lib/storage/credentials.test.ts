import { randomBytes } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  decryptStorageCredentials,
  encryptStorageCredentials,
  parseStorageCredentialKey,
  StorageCredentialError,
} from "./credentials";

const key = randomBytes(32).toString("base64");

describe("storage credential envelope", () => {
  it("round-trips credentials without serializing plaintext", () => {
    const credentials = {
      accessKeyId: "r2-access-key",
      secretAccessKey: "r2-super-secret",
    };
    const encrypted = encryptStorageCredentials(credentials, key, 7);

    expect(encrypted.credentialKeyVersion).toBe(7);
    expect(JSON.stringify(encrypted)).not.toContain("r2-access-key");
    expect(JSON.stringify(encrypted)).not.toContain("r2-super-secret");
    expect(decryptStorageCredentials(encrypted, key)).toEqual(credentials);
  });

  it("uses a fresh IV and authenticated encryption", () => {
    const first = encryptStorageCredentials({ token: "same" }, key);
    const second = encryptStorageCredentials({ token: "same" }, key);
    expect(first.credentialsIv).not.toBe(second.credentialsIv);
    expect(first.credentialsCiphertext).not.toBe(second.credentialsCiphertext);

    expect(() =>
      decryptStorageCredentials(
        { ...first, credentialsTag: Buffer.alloc(16, 1).toString("base64") },
        key,
      ),
    ).toThrow(StorageCredentialError);
    expect(() =>
      decryptStorageCredentials(first, randomBytes(32).toString("base64")),
    ).toThrow(StorageCredentialError);
  });

  it("requires exactly 32 bytes of base64 key material", () => {
    expect(parseStorageCredentialKey(key)).toHaveLength(32);
    for (const value of ["", "not-base64", randomBytes(31).toString("base64")]) {
      expect(() => parseStorageCredentialKey(value)).toThrow(StorageCredentialError);
    }
  });
});
