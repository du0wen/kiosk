import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { S3ContentStore } from "./s3";

const body = Buffer.from("<h1>S3</h1>");
const hash = createHash("sha256").update(body).digest("hex");

describe("S3ContentStore", () => {
  it("uses private immutable object commands and stored hash metadata", async () => {
    const calls: { name: string; input: Record<string, unknown> }[] = [];
    const client = {
      async send(command: { constructor: { name: string }; input: Record<string, unknown> }) {
        calls.push({ name: command.constructor.name, input: command.input });
        if (command.constructor.name === "GetObjectCommand") {
          return {
            Body: { transformToByteArray: async () => body },
            ContentLength: body.byteLength,
            Metadata: { contenthash: hash },
          };
        }
        if (command.constructor.name === "HeadObjectCommand") {
          return { ContentLength: body.byteLength, Metadata: { contenthash: hash } };
        }
        return {};
      },
    };
    const store = new S3ContentStore({ client, bucket: "private-bucket" });
    await store.put({
      key: "content/hash.html",
      body,
      contentHash: hash,
      contentType: "application/octet-stream",
    });
    expect(await store.get("content/hash.html")).toEqual(new Uint8Array(body));
    expect(await store.head("content/hash.html")).toEqual({
      sizeBytes: body.byteLength,
      contentHash: hash,
    });
    await store.delete("content/hash.html");
    expect(calls.map((call) => call.name)).toEqual([
      "PutObjectCommand",
      "GetObjectCommand",
      "HeadObjectCommand",
      "DeleteObjectCommand",
    ]);
    expect(calls[0].input).toMatchObject({
      Bucket: "private-bucket",
      Key: "content/hash.html",
      ContentType: "application/octet-stream",
      IfNoneMatch: "*",
      Metadata: { contenthash: hash },
    });
    expect(calls[0].input).not.toHaveProperty("ACL");
  });

  it("maps not-found and provider failures without leaking provider messages", async () => {
    const missing = new S3ContentStore({
      bucket: "private",
      client: {
        async send() {
          throw Object.assign(new Error("NoSuchKey secret endpoint"), {
            name: "NoSuchKey",
            $metadata: { httpStatusCode: 404 },
          });
        },
      },
    });
    expect(await missing.get("missing")).toBeNull();
    expect(await missing.head("missing")).toBeNull();

    const denied = new S3ContentStore({
      bucket: "private",
      client: {
        async send() {
          throw Object.assign(new Error("access secret-value"), {
            name: "AccessDenied",
            $metadata: { httpStatusCode: 403 },
          });
        },
      },
    });
    await expect(denied.get("key")).rejects.toMatchObject({
      code: "access_denied",
      message: "Object storage request failed",
    });
  });

  it("accepts an existing identical object after a conditional-write race", async () => {
    let calls = 0;
    const store = new S3ContentStore({
      bucket: "private",
      client: {
        async send(command: { constructor: { name: string } }) {
          calls += 1;
          if (command.constructor.name === "PutObjectCommand") {
            throw Object.assign(new Error("precondition"), {
              name: "PreconditionFailed",
              $metadata: { httpStatusCode: 412 },
            });
          }
          return { ContentLength: body.byteLength, Metadata: { contenthash: hash } };
        },
      },
    });
    await expect(
      store.put({
        key: "same",
        body,
        contentHash: hash,
        contentType: "application/octet-stream",
      }),
    ).resolves.toBeUndefined();
    expect(calls).toBe(2);
  });

  it("maps request aborts to a stable timeout without leaking details", async () => {
    const store = new S3ContentStore({
      bucket: "private",
      client: {
        async send() {
          throw Object.assign(new Error("timed out with secret endpoint"), { name: "AbortError" });
        },
      },
    });
    await expect(store.get("key")).rejects.toMatchObject({
      code: "timeout",
      message: "Object storage request failed",
    });
  });
});
