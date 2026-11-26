import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  S3Client,
  type S3ClientConfig,
} from "@aws-sdk/client-s3";
import {
  ContentStoreError,
  MAX_STORED_CONTENT_BYTES,
  probeContentStore,
  storageRequestError,
  validateObjectKey,
  validateListInput,
  validatePutInput,
  type ContentMetadata,
  type ContentStore,
  type ListContentResult,
  type PutContentInput,
} from "../content-store";

type S3ClientLike = {
  send(command: object, options?: { abortSignal?: AbortSignal }): Promise<unknown>;
};

type S3Result = {
  Body?: { transformToByteArray?: () => Promise<Uint8Array> };
  ContentLength?: number;
  Metadata?: Record<string, string>;
};

type S3ListResult = {
  Contents?: Array<{ Key?: string; Size?: number; LastModified?: Date }>;
  NextContinuationToken?: string;
};

type ProviderError = {
  name?: string;
  $metadata?: { httpStatusCode?: number };
};

function providerError(error: unknown): ProviderError {
  return error && typeof error === "object" ? error : {};
}

function isMissing(error: unknown): boolean {
  const current = providerError(error);
  return current.$metadata?.httpStatusCode === 404 || current.name === "NoSuchKey" || current.name === "NotFound";
}

function isPreconditionFailed(error: unknown): boolean {
  const current = providerError(error);
  return current.$metadata?.httpStatusCode === 412 || current.name === "PreconditionFailed";
}

function mapError(error: unknown): ContentStoreError {
  const current = providerError(error);
  if (current.$metadata?.httpStatusCode === 403 || current.name === "AccessDenied") {
    return storageRequestError("access_denied");
  }
  if (current.name === "AbortError" || current.name === "TimeoutError") {
    return storageRequestError("timeout");
  }
  return storageRequestError();
}

export class S3ContentStore implements ContentStore {
  private readonly client: S3ClientLike;
  private readonly bucket: string;
  private readonly timeoutMs: number;

  constructor(input: {
    client?: S3ClientLike;
    clientConfig?: S3ClientConfig;
    bucket: string;
    timeoutMs?: number;
  }) {
    this.client = input.client ?? new S3Client(input.clientConfig ?? {});
    this.bucket = input.bucket;
    this.timeoutMs = input.timeoutMs ?? 10_000;
  }

  private options(): { abortSignal: AbortSignal } {
    return { abortSignal: AbortSignal.timeout(this.timeoutMs) };
  }

  async put(input: PutContentInput): Promise<void> {
    validatePutInput(input);
    try {
      await this.client.send(
        new PutObjectCommand({
          Bucket: this.bucket,
          Key: input.key,
          Body: input.body,
          ContentType: input.contentType,
          IfNoneMatch: "*",
          Metadata: { contenthash: input.contentHash },
        }),
        this.options(),
      );
    } catch (error) {
      if (isPreconditionFailed(error)) {
        const existing = await this.head(input.key);
        if (
          existing?.sizeBytes === input.body.byteLength &&
          existing.contentHash === input.contentHash
        ) {
          return;
        }
        throw new ContentStoreError("object_conflict", "Object key already contains different content");
      }
      throw mapError(error);
    }
  }

  async get(key: string): Promise<Uint8Array | null> {
    validateObjectKey(key);
    try {
      const result = (await this.client.send(
        new GetObjectCommand({ Bucket: this.bucket, Key: key }),
        this.options(),
      )) as S3Result;
      if (!result.Body?.transformToByteArray) throw storageRequestError();
      if ((result.ContentLength ?? 0) > MAX_STORED_CONTENT_BYTES) {
        throw new ContentStoreError("object_too_large", "Stored content exceeds the size limit");
      }
      const body = await result.Body.transformToByteArray();
      if (body.byteLength > MAX_STORED_CONTENT_BYTES) {
        throw new ContentStoreError("object_too_large", "Stored content exceeds the size limit");
      }
      return new Uint8Array(body);
    } catch (error) {
      if (isMissing(error)) return null;
      if (error instanceof ContentStoreError) throw error;
      throw mapError(error);
    }
  }

  async head(key: string): Promise<ContentMetadata | null> {
    validateObjectKey(key);
    try {
      const result = (await this.client.send(
        new HeadObjectCommand({ Bucket: this.bucket, Key: key }),
        this.options(),
      )) as S3Result;
      return {
        sizeBytes: result.ContentLength ?? 0,
        ...(result.Metadata?.contenthash ? { contentHash: result.Metadata.contenthash } : {}),
      };
    } catch (error) {
      if (isMissing(error)) return null;
      throw mapError(error);
    }
  }

  async delete(key: string): Promise<void> {
    validateObjectKey(key);
    try {
      await this.client.send(
        new DeleteObjectCommand({ Bucket: this.bucket, Key: key }),
        this.options(),
      );
    } catch (error) {
      throw mapError(error);
    }
  }

  async list(input: { prefix: string; cursor?: string; limit: number }): Promise<ListContentResult> {
    validateListInput(input);
    try {
      const result = await this.client.send(new ListObjectsV2Command({
        Bucket: this.bucket,
        Prefix: input.prefix,
        ContinuationToken: input.cursor,
        MaxKeys: input.limit,
      }), this.options()) as S3ListResult;
      return {
        objects: (result.Contents ?? []).flatMap((object) => object.Key ? [{
          key: object.Key,
          sizeBytes: object.Size ?? 0,
          modifiedAt: object.LastModified ?? null,
        }] : []),
        cursor: result.NextContinuationToken ?? null,
      };
    } catch (error) {
      throw mapError(error);
    }
  }

  async testConnection(): Promise<void> {
    await probeContentStore(this);
  }
}
