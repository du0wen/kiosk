import { describe, it, expect, vi, afterEach } from "vitest";
import { KioskClient, CliError } from "./client";

afterEach(() => vi.unstubAllGlobals());

function stubFetch(status: number, body: unknown, headers: Record<string, string> = {}) {
  const fn = vi.fn(
    async () =>
      new Response(body === undefined ? null : JSON.stringify(body), {
        status,
        headers: { "content-type": "application/json", ...headers },
      }),
  );
  vi.stubGlobal("fetch", fn);
  return fn;
}

const client = () => new KioskClient("https://api.example/v1", "kiosk_api_x");

describe("KioskClient", () => {
  it("publish POSTs html with auth + title and returns the result", async () => {
    const fn = stubFetch(201, { id: "abc", url: "https://k/p/abc", createdAt: "t" });
    const r = await client().publish("<html></html>", "Title");
    expect(r).toEqual({ id: "abc", url: "https://k/p/abc", createdAt: "t" });
    const [url, init] = fn.mock.calls[0] as [string, RequestInit & { headers: Record<string, string> }];
    expect(url).toBe("https://api.example/v1/pages");
    expect(init.method).toBe("POST");
    expect(init.headers.authorization).toBe("Bearer kiosk_api_x");
    expect(init.headers["x-kiosk-title"]).toBe("Title");
    expect(init.body).toBe("<html></html>");
  });
  it("update PUTs to /pages/:id", async () => {
    const fn = stubFetch(200, { id: "abc", url: "u", updatedAt: "t" });
    await client().update("abc", "<html></html>");
    const [url, init] = fn.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://api.example/v1/pages/abc");
    expect(init.method).toBe("PUT");
  });
  it("throws CliError with the server message on error", async () => {
    stubFetch(413, {
      error: { code: "too_large", message: "Page exceeds 2MB limit" },
    });
    await expect(client().publish("x")).rejects.toMatchObject({
      message: "Page exceeds 2MB limit",
    });
  });
  it("maps 401 to exit code 2", async () => {
    stubFetch(401, { error: { code: "unauthorized", message: "bad" } });
    await expect(client().me()).rejects.toMatchObject({ exitCode: 2 });
  });
  it("maps 429 to a concise retry message", async () => {
    stubFetch(
      429,
      { error: { code: "rate_limited", message: "Too many requests" } },
      { "retry-after": "42" },
    );
    await expect(client().publish("x")).rejects.toMatchObject({
      message: "Too many requests. Retry in 42 seconds.",
      exitCode: 1,
    });
  });
  it("del succeeds on 204", async () => {
    stubFetch(204, undefined);
    await expect(client().del("abc")).resolves.toBeUndefined();
  });
  it("CliError is thrown for a bad request", async () => {
    stubFetch(400, { error: { code: "bad_request", message: "Empty body" } });
    await expect(client().publish("")).rejects.toBeInstanceOf(CliError);
  });
  it("publish with visibility sends the x-kiosk-visibility header", async () => {
    const fn = stubFetch(201, { id: "a", url: "u", visibility: "public" });
    await client().publish("<html></html>", "T", "public");
    const [, init] = fn.mock.calls[0] as [
      string,
      RequestInit & { headers: Record<string, string> },
    ];
    expect(init.headers["x-kiosk-visibility"]).toBe("public");
  });
  it("setVisibility PATCHes a JSON body", async () => {
    const fn = stubFetch(200, { id: "a", url: "u", visibility: "org" });
    await client().setVisibility("abc", "org");
    const [url, init] = fn.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://api.example/v1/pages/abc");
    expect(init.method).toBe("PATCH");
    expect(JSON.parse(init.body as string)).toEqual({ visibility: "org" });
  });
});
