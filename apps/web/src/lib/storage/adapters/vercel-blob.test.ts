import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { VercelBlobContentStore } from "./vercel-blob";

const body = Buffer.from("<h1>Blob</h1>");
const hash = createHash("sha256").update(body).digest("hex");

function stream(bytes: Uint8Array): ReadableStream<Uint8Array> {
  return new ReadableStream({
    start(controller) {
      controller.enqueue(bytes);
      controller.close();
    },
  });
}

describe("VercelBlobContentStore", () => {
  it("always uses private server-side operations", async () => {
    const calls: { method: string; options?: Record<string, unknown> }[] = [];
    const api = {
      async put(_key: string, _body: Uint8Array, options: Record<string, unknown>) {
        calls.push({ method: "put", options });
        return { pathname: "key", url: "https://private.blob/key" };
      },
      async get(_key: string, options: Record<string, unknown>) {
        calls.push({ method: "get", options });
        return {
          statusCode: 200,
          stream: stream(body),
          blob: { size: body.byteLength },
          headers: new Headers({ "x-kiosk-content-hash": hash }),
        };
      },
      async head(_key: string, options: Record<string, unknown>) {
        calls.push({ method: "head", options });
        throw Object.assign(new Error("missing"), { name: "BlobNotFoundError" });
      },
      async del(_key: string, options: Record<string, unknown>) {
        calls.push({ method: "del", options });
      },
    };
    const store = new VercelBlobContentStore({ token: "blob-secret", api });
    await store.put({
      key: "content/hash.html",
      body,
      contentHash: hash,
      contentType: "application/octet-stream",
    });
    expect(await store.get("content/hash.html")).toEqual(new Uint8Array(body));
    expect(await store.head("content/hash.html")).toBeNull();
    await store.delete("content/hash.html");
    expect(calls.find((call) => call.method === "put")?.options).toMatchObject({
      access: "private",
      addRandomSuffix: false,
      allowOverwrite: false,
      contentType: "application/octet-stream",
      token: "blob-secret",
    });
    expect(calls.find((call) => call.method === "get")?.options).toMatchObject({
      access: "private",
      token: "blob-secret",
    });
  });

  it("returns null for missing reads and sanitizes SDK failures", async () => {
    const missing = new VercelBlobContentStore({
      token: "token",
      api: {
        async get() {
          return null;
        },
        async head() {
          throw Object.assign(new Error("missing"), { name: "BlobNotFoundError" });
        },
        async put() {
          throw new Error("provider leaked blob-secret");
        },
        async del() {},
      },
    });
    expect(await missing.get("missing")).toBeNull();
    expect(await missing.head("missing")).toBeNull();
    await expect(
      missing.put({
        key: "key",
        body,
        contentHash: hash,
        contentType: "application/octet-stream",
      }),
    ).rejects.toMatchObject({
      code: "unavailable",
      message: "Object storage request failed",
    });
  });

  it("maps request aborts to a stable timeout", async () => {
    const store = new VercelBlobContentStore({
      token: "token",
      api: {
        async get() {
          throw Object.assign(new Error("secret timeout"), { name: "AbortError" });
        },
        async head() {
          throw Object.assign(new Error("missing"), { name: "BlobNotFoundError" });
        },
        async put() {},
        async del() {},
      },
    });
    await expect(store.get("key")).rejects.toMatchObject({
      code: "timeout",
      message: "Object storage request failed",
    });
  });

  it("treats an existing identical object as idempotent and rejects different content", async () => {
    const existing = body;
    const api = {
      async get() {
        return {
          statusCode: 200,
          stream: stream(existing),
          blob: { size: existing.byteLength },
          headers: new Headers(),
        };
      },
      async head() {
        return { size: existing.byteLength };
      },
      async put() {
        throw new Error("put must not run for an existing object");
      },
      async del() {},
    };
    const store = new VercelBlobContentStore({ token: "token", api });
    await expect(
      store.put({
        key: "same",
        body,
        contentHash: hash,
        contentType: "application/octet-stream",
      }),
    ).resolves.toBeUndefined();
    const different = Buffer.from("different");
    await expect(
      store.put({
        key: "same",
        body: different,
        contentHash: createHash("sha256").update(different).digest("hex"),
        contentType: "application/octet-stream",
      }),
    ).rejects.toMatchObject({ code: "object_conflict" });
  });
});
