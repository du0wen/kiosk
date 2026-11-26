import { constants } from "node:fs";
import { mkdir, open, readFile, readdir, rm, stat } from "node:fs/promises";
import { dirname, isAbsolute, relative, resolve, sep } from "node:path";
import {
  ContentStoreError,
  MAX_STORED_CONTENT_BYTES,
  contentDigest,
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
import { StorageConfigError } from "../contracts";

function missing(error: unknown): boolean {
  return !!error && typeof error === "object" && "code" in error && error.code === "ENOENT";
}

export class FilesystemContentStore implements ContentStore {
  private readonly root: string;

  constructor(root: string) {
    if (!isAbsolute(root)) {
      throw new StorageConfigError("Filesystem storage requires an absolute root path");
    }
    this.root = resolve(root);
  }

  private path(key: string): string {
    validateObjectKey(key);
    const path = resolve(this.root, key);
    if (!path.startsWith(`${this.root}${sep}`)) {
      throw new ContentStoreError("invalid_key", "Invalid object key");
    }
    return path;
  }

  async put(input: PutContentInput): Promise<void> {
    validatePutInput(input);
    const path = this.path(input.key);
    await mkdir(dirname(path), { recursive: true });
    try {
      const file = await open(path, constants.O_CREAT | constants.O_EXCL | constants.O_WRONLY, 0o600);
      try {
        await file.writeFile(input.body);
        await file.sync();
      } finally {
        await file.close();
      }
    } catch (error) {
      if (error && typeof error === "object" && "code" in error && error.code === "EEXIST") {
        const existing = await this.get(input.key);
        if (existing && contentDigest(existing) === input.contentHash) return;
        throw new ContentStoreError("object_conflict", "Object key already contains different content");
      }
      await rm(path, { force: true }).catch(() => undefined);
      throw storageRequestError();
    }
  }

  async get(key: string): Promise<Uint8Array | null> {
    const path = this.path(key);
    try {
      const metadata = await stat(path);
      if (metadata.size > MAX_STORED_CONTENT_BYTES) {
        throw new ContentStoreError("object_too_large", "Stored content exceeds the size limit");
      }
      return new Uint8Array(await readFile(path));
    } catch (error) {
      if (missing(error)) return null;
      if (error instanceof ContentStoreError) throw error;
      throw storageRequestError();
    }
  }

  async head(key: string): Promise<ContentMetadata | null> {
    const body = await this.get(key);
    return body ? { sizeBytes: body.byteLength, contentHash: contentDigest(body) } : null;
  }

  async delete(key: string): Promise<void> {
    const path = this.path(key);
    try {
      await rm(path);
    } catch (error) {
      if (!missing(error)) throw storageRequestError();
    }
  }

  async list(input: { prefix: string; cursor?: string; limit: number }): Promise<ListContentResult> {
    validateListInput(input);
    const keys: string[] = [];
    const walk = async (directory: string): Promise<void> => {
      let entries;
      try {
        entries = await readdir(directory, { withFileTypes: true });
      } catch (error) {
        if (missing(error)) return;
        throw storageRequestError();
      }
      for (const entry of entries) {
        const path = resolve(directory, entry.name);
        if (entry.isDirectory()) await walk(path);
        else if (entry.isFile()) keys.push(relative(this.root, path).split(sep).join("/"));
      }
    };
    await walk(this.root);
    const selected = keys
      .filter((key) => key.startsWith(input.prefix) && (!input.cursor || key > input.cursor))
      .sort()
      .slice(0, input.limit);
    const objects = await Promise.all(selected.map(async (key) => {
      const metadata = await stat(this.path(key));
      return { key, sizeBytes: metadata.size, modifiedAt: metadata.mtime };
    }));
    return { objects, cursor: objects.length === input.limit ? objects.at(-1)!.key : null };
  }

  async testConnection(): Promise<void> {
    await probeContentStore(this);
  }
}
