import {
  BlobNotFoundError,
  BlobPreconditionFailedError,
  BlobRequestAbortedError,
  del,
  get,
  head,
  list,
  put,
} from "@vercel/blob";
import {
  ContentStoreError,
  contentDigest,
  probeContentStore,
  readBoundedStream,
  storageRequestError,
  validateObjectKey,
  validateListInput,
  validatePutInput,
  type ContentMetadata,
  type ContentStore,
  type ListContentResult,
  type PutContentInput,
} from "../content-store";

type BlobGetResult = {
  statusCode: number;
  stream: ReadableStream<Uint8Array> | null;
  blob: { size: number | null };
  headers: unknown;
};

type VercelBlobApi = {
  put(key: string, body: Uint8Array, options: Record<string, unknown>): Promise<unknown>;
  get(key: string, options: Record<string, unknown>): Promise<BlobGetResult | null>;
  head(key: string, options: Record<string, unknown>): Promise<{ size: number }>;
  del(key: string, options: Record<string, unknown>): Promise<void>;
  list?(options: Record<string, unknown>): Promise<{
    blobs: Array<{ pathname: string; size: number; uploadedAt: Date }>;
    cursor?: string;
    hasMore: boolean;
  }>;
};

const defaultApi: VercelBlobApi = {
  put: (key, body, options) =>
    put(key, Buffer.from(body), options as unknown as Parameters<typeof put>[2]),
  get: (key, options) => get(key, options as unknown as Parameters<typeof get>[1]),
  head: (key, options) => head(key, options as unknown as Parameters<typeof head>[1]),
  del: (key, options) => del(key, options as unknown as Parameters<typeof del>[1]),
  list: (options) => list(options as unknown as Parameters<typeof list>[0]),
};

function isMissing(error: unknown): boolean {
  return error instanceof BlobNotFoundError ||
    (!!error && typeof error === "object" && "name" in error && error.name === "BlobNotFoundError");
}

function isConflict(error: unknown): boolean {
  return error instanceof BlobPreconditionFailedError ||
    (!!error && typeof error === "object" && "name" in error &&
      (error.name === "BlobPreconditionFailedError" || error.name === "BlobAlreadyExistsError"));
}

function mapError(error: unknown): ContentStoreError {
  if (error instanceof BlobRequestAbortedError ||
    (!!error && typeof error === "object" && "name" in error && error.name === "AbortError")) {
    return storageRequestError("timeout");
  }
  return storageRequestError();
}

export class VercelBlobContentStore implements ContentStore {
  private readonly token: string;
  private readonly api: VercelBlobApi;
  private readonly timeoutMs: number;

  constructor(input: { token: string; api?: VercelBlobApi; timeoutMs?: number }) {
    this.token = input.token;
    this.api = input.api ?? defaultApi;
    this.timeoutMs = input.timeoutMs ?? 10_000;
  }

  private options(): Record<string, unknown> {
    return { token: this.token, abortSignal: AbortSignal.timeout(this.timeoutMs) };
  }

  private async matchesExisting(input: PutContentInput): Promise<boolean> {
    const existing = await this.get(input.key);
    return !!existing && contentDigest(existing) === input.contentHash;
  }

  async put(input: PutContentInput): Promise<void> {
    validatePutInput(input);
    try {
      const existing = await this.head(input.key);
      if (existing) {
        if (await this.matchesExisting(input)) return;
        throw new ContentStoreError("object_conflict", "Object key already contains different content");
      }
      await this.api.put(input.key, input.body, {
        ...this.options(),
        access: "private",
        addRandomSuffix: false,
        allowOverwrite: false,
        contentType: input.contentType,
      });
    } catch (error) {
      if (error instanceof ContentStoreError) throw error;
      if (isConflict(error)) {
        if (await this.matchesExisting(input)) return;
        throw new ContentStoreError("object_conflict", "Object key already contains different content");
      }
      throw mapError(error);
    }
  }

  async get(key: string): Promise<Uint8Array | null> {
    validateObjectKey(key);
    try {
      const result = await this.api.get(key, {
        ...this.options(),
        access: "private",
      });
      if (!result) return null;
      if (result.statusCode !== 200 || !result.stream) throw storageRequestError();
      return await readBoundedStream(result.stream, result.blob.size ?? undefined);
    } catch (error) {
      if (isMissing(error)) return null;
      if (error instanceof ContentStoreError) throw error;
      throw mapError(error);
    }
  }

  async head(key: string): Promise<ContentMetadata | null> {
    validateObjectKey(key);
    try {
      const result = await this.api.head(key, this.options());
      return { sizeBytes: result.size };
    } catch (error) {
      if (isMissing(error)) return null;
      throw mapError(error);
    }
  }

  async delete(key: string): Promise<void> {
    validateObjectKey(key);
    try {
      await this.api.del(key, this.options());
    } catch (error) {
      if (!isMissing(error)) throw mapError(error);
    }
  }

  async list(input: { prefix: string; cursor?: string; limit: number }): Promise<ListContentResult> {
    validateListInput(input);
    try {
      if (!this.api.list) throw storageRequestError();
      const result = await this.api.list({
        ...this.options(),
        prefix: input.prefix,
        cursor: input.cursor,
        limit: input.limit,
      });
      return {
        objects: result.blobs.map((blob) => ({
          key: blob.pathname,
          sizeBytes: blob.size,
          modifiedAt: blob.uploadedAt,
        })),
        cursor: result.hasMore ? result.cursor ?? null : null,
      };
    } catch (error) {
      throw mapError(error);
    }
  }

  async testConnection(): Promise<void> {
    await probeContentStore(this);
  }
}
