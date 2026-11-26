import { createHash, randomUUID } from "node:crypto";
import { StorageError, type StorageErrorCode } from "./errors";

export const MAX_STORED_CONTENT_BYTES = 2 * 1024 * 1024;

export type PutContentInput = {
  key: string;
  body: Uint8Array;
  contentHash: string;
  contentType: "application/octet-stream";
};

export type ContentMetadata = {
  sizeBytes: number;
  contentHash?: string;
};

export type ListedContentObject = ContentMetadata & {
  key: string;
  modifiedAt: Date | null;
};

export type ListContentResult = {
  objects: ListedContentObject[];
  cursor: string | null;
};

export interface ContentStore {
  put(input: PutContentInput): Promise<void>;
  get(key: string): Promise<Uint8Array | null>;
  head(key: string): Promise<ContentMetadata | null>;
  delete(key: string): Promise<void>;
  list?(input: { prefix: string; cursor?: string; limit: number }): Promise<ListContentResult>;
  testConnection(): Promise<void>;
}

export function validateListInput(input: { prefix: string; limit: number }): void {
  if (
    !input.prefix ||
    input.prefix.length > 1024 ||
    input.prefix.startsWith("/") ||
    input.prefix.includes("\\") ||
    input.prefix.includes("\0") ||
    input.prefix.split("/").some((part, index, parts) =>
      (part === "" && index !== parts.length - 1) || part === "." || part === "..")
  ) {
    throw new ContentStoreError("invalid_key", "Invalid object prefix");
  }
  if (!Number.isInteger(input.limit) || input.limit < 1 || input.limit > 500) {
    throw new ContentStoreError("invalid_configuration", "List limit must be between 1 and 500");
  }
}

export class ContentStoreError extends StorageError {
  constructor(code: StorageErrorCode, message: string) {
    super(code, message);
    this.name = "ContentStoreError";
  }
}

export function validateObjectKey(key: string): string {
  const parts = key.split("/");
  if (
    !key ||
    key.length > 1024 ||
    key.startsWith("/") ||
    key.includes("\\") ||
    key.includes("\0") ||
    parts.some((part) => !part || part === "." || part === "..")
  ) {
    throw new ContentStoreError("invalid_key", "Invalid object key");
  }
  return key;
}

export function contentDigest(body: Uint8Array): string {
  return createHash("sha256").update(body).digest("hex");
}

export function validatePutInput(input: PutContentInput): void {
  validateObjectKey(input.key);
  if (input.body.byteLength > MAX_STORED_CONTENT_BYTES) {
    throw new ContentStoreError("object_too_large", "Stored content exceeds the size limit");
  }
  if (!/^[a-f0-9]{64}$/.test(input.contentHash) || contentDigest(input.body) !== input.contentHash) {
    throw new ContentStoreError("object_conflict", "Content hash does not match the object body");
  }
}

export async function readBoundedStream(
  stream: ReadableStream<Uint8Array>,
  expectedSize?: number,
): Promise<Uint8Array> {
  if (expectedSize !== undefined && expectedSize > MAX_STORED_CONTENT_BYTES) {
    throw new ContentStoreError("object_too_large", "Stored content exceeds the size limit");
  }
  const reader = stream.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > MAX_STORED_CONTENT_BYTES) {
        await reader.cancel();
        throw new ContentStoreError("object_too_large", "Stored content exceeds the size limit");
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const body = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return body;
}

export async function probeContentStore(store: ContentStore): Promise<void> {
  const body = new TextEncoder().encode("kiosk-storage-probe");
  const key = `_kiosk-health/${randomUUID()}`;
  try {
    await store.put({
      key,
      body,
      contentHash: contentDigest(body),
      contentType: "application/octet-stream",
    });
    const loaded = await store.get(key);
    const metadata = await store.head(key);
    if (!loaded || contentDigest(loaded) !== contentDigest(body) || metadata?.sizeBytes !== body.byteLength) {
      throw new ContentStoreError("unavailable", "Object storage connection probe failed");
    }
  } finally {
    await store.delete(key).catch(() => undefined);
  }
}

export function storageRequestError(code: StorageErrorCode = "unavailable"): ContentStoreError {
  return new ContentStoreError(code, "Object storage request failed");
}
