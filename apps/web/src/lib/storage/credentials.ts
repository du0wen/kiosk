import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { StorageError } from "./errors";

const ALGORITHM = "aes-256-gcm";
const IV_BYTES = 12;

export type StorageCredentialEnvelope = {
  credentialsCiphertext: string;
  credentialsIv: string;
  credentialsTag: string;
  credentialKeyVersion: number;
};

export class StorageCredentialError extends StorageError {
  constructor(message = "Storage credentials are unavailable") {
    super("credential_error", message);
    this.name = "StorageCredentialError";
  }
}

export function parseStorageCredentialKey(value: string | undefined): Buffer {
  if (!value) throw new StorageCredentialError();
  const key = Buffer.from(value, "base64");
  if (key.length !== 32 || key.toString("base64") !== value) {
    throw new StorageCredentialError();
  }
  return key;
}

function aad(version: number): Buffer {
  return Buffer.from(`kiosk-storage-credentials:v${version}`, "utf8");
}

export function encryptStorageCredentials(
  credentials: Record<string, unknown>,
  encodedKey: string | undefined = process.env.STORAGE_CREDENTIAL_KEY,
  credentialKeyVersion = 1,
): StorageCredentialEnvelope {
  const key = parseStorageCredentialKey(encodedKey);
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  cipher.setAAD(aad(credentialKeyVersion));
  const ciphertext = Buffer.concat([
    cipher.update(JSON.stringify(credentials), "utf8"),
    cipher.final(),
  ]);
  return {
    credentialsCiphertext: ciphertext.toString("base64"),
    credentialsIv: iv.toString("base64"),
    credentialsTag: cipher.getAuthTag().toString("base64"),
    credentialKeyVersion,
  };
}

export function decryptStorageCredentials(
  envelope: StorageCredentialEnvelope,
  encodedKey: string | undefined = process.env.STORAGE_CREDENTIAL_KEY,
): Record<string, unknown> {
  try {
    const decipher = createDecipheriv(
      ALGORITHM,
      parseStorageCredentialKey(encodedKey),
      Buffer.from(envelope.credentialsIv, "base64"),
    );
    decipher.setAAD(aad(envelope.credentialKeyVersion));
    decipher.setAuthTag(Buffer.from(envelope.credentialsTag, "base64"));
    const plaintext = Buffer.concat([
      decipher.update(Buffer.from(envelope.credentialsCiphertext, "base64")),
      decipher.final(),
    ]).toString("utf8");
    const parsed: unknown = JSON.parse(plaintext);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      throw new Error("invalid credential payload");
    }
    return parsed as Record<string, unknown>;
  } catch {
    throw new StorageCredentialError();
  }
}
