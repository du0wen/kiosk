import { afterEach, describe, expect, it } from "vitest";
import {
  CLIENT_CAPABILITIES_META_KEY,
  CLIENT_INFO_META_KEY,
  PROTOCOL_VERSION_META_KEY,
} from "@modelcontextprotocol/server";
import { db } from "@/db";
import { pages, user } from "@/db/schema";
import { and, eq } from "drizzle-orm";
import { addMember, cleanupPrincipal, createPrincipal } from "@/test/factories";
import { hashToken } from "@/lib/token";
import { handleMcpPost, loadMcpHttpConfig } from "./http";

type Principal = Awaited<ReturnType<typeof createPrincipal>>;
let principals: Principal[] = [];
let extraUserIds: string[] = [];

afterEach(async () => {
  for (const principal of principals.reverse()) await cleanupPrincipal(principal);
  for (const userId of extraUserIds) await db.delete(user).where(eq(user.id, userId));
  principals = [];
  extraUserIds = [];
});

const config = loadMcpHttpConfig({ APP_ORIGIN: "http://localhost:58671" });

async function principal(): Promise<Principal> {
  const value = await createPrincipal();
  principals.push(value);
  return value;
}

async function callTool(
  token: string,
  name: string,
  args: Record<string, unknown>,
): Promise<{ isError?: boolean; structuredContent?: Record<string, unknown>; content: unknown[] }> {
  const response = await handleMcpPost(
    new Request("http://localhost:58671/mcp", {
      method: "POST",
      headers: {
        host: "localhost:58671",
        authorization: `Bearer ${token}`,
        "content-type": "application/json",
        "mcp-protocol-version": "2026-07-28",
        "mcp-method": "tools/call",
        "mcp-name": name,
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "tools/call",
        params: {
          name,
          arguments: args,
          _meta: {
            [PROTOCOL_VERSION_META_KEY]: "2026-07-28",
            [CLIENT_CAPABILITIES_META_KEY]: {},
            [CLIENT_INFO_META_KEY]: { name: "security-test", version: "1" },
          },
        },
      }),
    }),
    { config },
  );
  expect(response.status).toBe(200);
  const body = (await response.json()) as {
    result: {
      isError?: boolean;
      structuredContent?: Record<string, unknown>;
      content: unknown[];
    };
  };
  return body.result;
}

describe("MCP security integration", () => {
  it("enforces organization and member-owner boundaries without leaking data", async () => {
    const owner = await principal();
    const other = await principal();
    const member = await addMember(owner.organizationId, "member");
    extraUserIds.push(member.userId);

    const published = await callTool(owner.token, "publish_page", {
      html: "<html><title>Secret</title><body>private-value</body></html>",
    });
    const metadata = published.structuredContent!;
    const pageId = metadata.id as string;
    const [stored] = await db
      .select({ id: pages.id })
      .from(pages)
      .where(and(eq(pages.publicId, pageId), eq(pages.organizationId, owner.organizationId)))
      .limit(1);
    expect(pageId).toMatch(/^[0-9A-Za-z]{12}$/);
    const serialized = JSON.stringify(published);
    expect(serialized).not.toContain("private-value");
    expect(serialized).not.toContain("contentHtml");
    expect(serialized).not.toContain("contentHash");
    expect(serialized).not.toContain(owner.token);
    expect(serialized).not.toContain(hashToken(owner.token));
    expect(serialized).not.toContain(stored.id);

    const crossOrg = await callTool(other.token, "get_page", { pageId });
    expect(crossOrg.isError).toBe(true);
    expect(JSON.stringify(crossOrg)).toContain("Page not found");

    for (const [name, args] of [
      ["set_page_visibility", { pageId, visibility: "public" }],
      ["delete_page", { pageId }],
    ] as const) {
      const forbidden = await callTool(member.token, name, args);
      expect(forbidden.isError).toBe(true);
      expect(JSON.stringify(forbidden)).not.toContain(owner.userId);
    }

    const own = await callTool(member.token, "publish_page", { html: "<h1>Own</h1>" });
    const ownId = own.structuredContent!.id as string;
    expect(
      (await callTool(member.token, "set_page_visibility", {
        pageId: ownId,
        visibility: "public",
      })).structuredContent?.visibility,
    ).toBe("public");
    expect(
      (await callTool(member.token, "delete_page", { pageId: ownId }))
        .structuredContent,
    ).toEqual({ id: ownId, deleted: true });
  });

  it(
    "accepts exactly 2 MiB of UTF-8 HTML and rejects one byte more",
    async () => {
      const owner = await principal();
      const accepted = await callTool(owner.token, "publish_page", {
        html: "a".repeat(2 * 1024 * 1024),
      });
      expect(accepted.isError).not.toBe(true);
      expect(accepted.structuredContent?.sizeBytes).toBe(2 * 1024 * 1024);
      const pageId = accepted.structuredContent?.id as string;

      const updated = await callTool(owner.token, "publish_page", {
        pageId,
        html: "b".repeat(2 * 1024 * 1024),
      });
      expect(updated.isError).not.toBe(true);
      expect(updated.structuredContent?.sizeBytes).toBe(2 * 1024 * 1024);

      const rejected = await callTool(owner.token, "publish_page", {
        pageId,
        html: "a".repeat(2 * 1024 * 1024 + 1),
      });
      expect(rejected.isError).toBe(true);
      expect(JSON.stringify(rejected)).toContain("2MB limit");
    },
    60_000,
  );
});
