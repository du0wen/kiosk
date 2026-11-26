import {
  ContentStoreError,
  probeContentStore,
  validateObjectKey,
  validateListInput,
  validatePutInput,
  type ContentMetadata,
  type ContentStore,
  type ListContentResult,
  type PutContentInput,
} from "../content-store";

type StoredObject = { body: Uint8Array; contentHash: string; modifiedAt: Date };

export class MemoryContentStore implements ContentStore {
  private readonly objects = new Map<string, StoredObject>();

  async put(input: PutContentInput): Promise<void> {
    validatePutInput(input);
    const existing = this.objects.get(input.key);
    if (existing) {
      if (existing.contentHash !== input.contentHash) {
        throw new ContentStoreError("object_conflict", "Object key already contains different content");
      }
      return;
    }
    this.objects.set(input.key, { body: input.body.slice(), contentHash: input.contentHash, modifiedAt: new Date() });
  }

  async get(key: string): Promise<Uint8Array | null> {
    validateObjectKey(key);
    return this.objects.get(key)?.body.slice() ?? null;
  }

  async head(key: string): Promise<ContentMetadata | null> {
    validateObjectKey(key);
    const object = this.objects.get(key);
    return object ? { sizeBytes: object.body.byteLength, contentHash: object.contentHash } : null;
  }

  async delete(key: string): Promise<void> {
    validateObjectKey(key);
    this.objects.delete(key);
  }

  async list(input: { prefix: string; cursor?: string; limit: number }): Promise<ListContentResult> {
    validateListInput(input);
    const objects = [...this.objects.entries()]
      .filter(([key]) => key.startsWith(input.prefix) && (!input.cursor || key > input.cursor))
      .sort(([a], [b]) => a.localeCompare(b))
      .slice(0, input.limit)
      .map(([key, value]) => ({
        key,
        sizeBytes: value.body.byteLength,
        contentHash: value.contentHash,
        modifiedAt: value.modifiedAt,
      }));
    return { objects, cursor: objects.length === input.limit ? objects.at(-1)!.key : null };
  }

  async testConnection(): Promise<void> {
    await probeContentStore(this);
  }
}
