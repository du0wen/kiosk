import { createHash } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ContentStore } from "../content-store";
import { FilesystemContentStore } from "./filesystem";
import { MemoryContentStore } from "./memory";

const roots: string[] = [];

afterEach(async () => {
  vi.unstubAllEnvs();
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

function digest(body: Uint8Array): string {
  return createHash("sha256").update(body).digest("hex");
}

function contract(name: string, factory: () => Promise<ContentStore>) {
  describe(`${name} content store contract`, () => {
    it("round-trips immutable content and supports idempotent put", async () => {
      const store = await factory();
      const body = Buffer.from("<h1>stored</h1>");
      const input = {
        key: "organizations/org/content/sha256/abc.html",
        body,
        contentHash: digest(body),
        contentType: "application/octet-stream" as const,
      };
      await store.put(input);
      await store.put(input);
      expect(Buffer.from((await store.get(input.key))!)).toEqual(body);
      expect(await store.head(input.key)).toEqual({
        sizeBytes: body.byteLength,
        contentHash: input.contentHash,
      });
      await store.delete(input.key);
      expect(await store.get(input.key)).toBeNull();
      expect(await store.head(input.key)).toBeNull();
    });

    it("never overwrites a key with different content", async () => {
      const store = await factory();
      const first = Buffer.from("first");
      const second = Buffer.from("second");
      const key = "organizations/org/content/sha256/conflict.html";
      await store.put({
        key,
        body: first,
        contentHash: digest(first),
        contentType: "application/octet-stream",
      });
      await expect(
        store.put({
          key,
          body: second,
          contentHash: digest(second),
          contentType: "application/octet-stream",
        }),
      ).rejects.toMatchObject({ code: "object_conflict" });
      expect(Buffer.from((await store.get(key))!)).toEqual(first);
    });

    it("passes a write/read/delete connection probe", async () => {
      await expect((await factory()).testConnection()).resolves.toBeUndefined();
    });

    it("lists a bounded private prefix with a resumable cursor", async () => {
      const store = await factory();
      for (const key of ["organizations/org/a", "organizations/org/b", "other/c"]) {
        const body = Buffer.from(key);
        await store.put({ key, body, contentHash: digest(body), contentType: "application/octet-stream" });
      }
      const first = await store.list!({ prefix: "organizations/", limit: 1 });
      expect(first.objects.map((object) => object.key)).toEqual(["organizations/org/a"]);
      expect(first.cursor).toBeTruthy();
      const second = await store.list!({ prefix: "organizations/", cursor: first.cursor!, limit: 2 });
      expect(second.objects.map((object) => object.key)).toEqual(["organizations/org/b"]);
      expect(second.cursor).toBeNull();
    });

    it("rejects invalid hashes and oversized bodies before writing", async () => {
      const store = await factory();
      const body = Buffer.from("body");
      await expect(
        store.put({
          key: "content/invalid.html",
          body,
          contentHash: "0".repeat(64),
          contentType: "application/octet-stream",
        }),
      ).rejects.toMatchObject({ code: "object_conflict" });

      const oversized = new Uint8Array(2 * 1024 * 1024 + 1);
      await expect(
        store.put({
          key: "content/large.html",
          body: oversized,
          contentHash: digest(oversized),
          contentType: "application/octet-stream",
        }),
      ).rejects.toMatchObject({ code: "object_too_large" });
    });
  });
}

contract("memory", async () => new MemoryContentStore());
contract("filesystem", async () => {
  const root = await mkdtemp(join(tmpdir(), "kiosk-content-"));
  roots.push(root);
  return new FilesystemContentStore(root);
});

describe("filesystem key safety", () => {
  it("rejects relative roots and allows absolute paths in production", async () => {
    expect(() => new FilesystemContentStore("relative/path")).toThrowError(
      expect.objectContaining({ code: "invalid_configuration" }),
    );
    vi.stubEnv("NODE_ENV", "production");
    expect(() => new FilesystemContentStore("/var/lib/kiosk/storage")).not.toThrow();
  });

  it("rejects traversal and absolute keys", async () => {
    const root = await mkdtemp(join(tmpdir(), "kiosk-content-"));
    roots.push(root);
    const store = new FilesystemContentStore(root);
    for (const key of ["../secret", "/etc/passwd", "safe/../../secret", "safe\0bad"]) {
      await expect(store.get(key)).rejects.toMatchObject({ code: "invalid_key" });
    }
  });
});
