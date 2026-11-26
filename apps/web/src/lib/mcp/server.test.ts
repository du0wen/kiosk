import { describe, expect, it, vi } from "vitest";
import {
  CLIENT_CAPABILITIES_META_KEY,
  CLIENT_INFO_META_KEY,
  PROTOCOL_VERSION_META_KEY,
} from "@modelcontextprotocol/server";
import contract from "./tools.contract.json";
import type { Caller, KioskOperations, PageMetadata } from "@/lib/page-operations";
import { createKioskMcpHandler } from "./server";
import type { McpCaller } from "./server";

const caller: Caller = {
  userId: "user-1",
  organizationId: "org-1",
  role: "owner",
};

const page: PageMetadata = {
  id: "AbCdEf123456",
  url: "https://app.example/v/AbCdEf123456",
  rawUrl: "https://serve.example/p/AbCdEf123456",
  title: "Demo",
  visibility: "org",
  sizeBytes: 42,
  viewCount: 3,
  createdAt: new Date("2026-09-08T00:00:00.000Z"),
  updatedAt: new Date("2026-09-08T00:00:00.000Z"),
};

function fakeOperations(): KioskOperations {
  return {
    createPage: vi.fn(async () => page),
    updatePage: vi.fn(async () => ({ ...page, title: "Updated" })),
    listPages: vi.fn(async () => ({ items: [page], nextCursor: null })),
    getPage: vi.fn(async () => page),
    setPageVisibility: vi.fn(async () => ({ ...page, visibility: "public" as const })),
    deletePage: vi.fn(async () => ({ id: page.id, deleted: true as const })),
    getCallerProfile: vi.fn(async () => ({
      user: { id: caller.userId, name: "Kevin", email: "kevin@example.com" },
      organization: { id: caller.organizationId, name: "Kiosk", slug: "kiosk" },
      role: caller.role,
    })),
  };
}

async function rpc(
  operations: KioskOperations,
  method: string,
  params: Record<string, unknown> = {},
  activeCaller: McpCaller = caller,
): Promise<Record<string, unknown>> {
  const handler = createKioskMcpHandler(activeCaller, operations);
  try {
    const response = await handler.fetch(
      new Request("http://localhost/mcp", {
        method: "POST",
        headers: {
          accept: "application/json, text/event-stream",
          "content-type": "application/json",
        },
        body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
      }),
    );
    expect(response.status).toBe(200);
    const body = await response.text();
    const json = response.headers.get("content-type")?.includes("text/event-stream")
      ? body
          .split("\n")
          .find((line) => line.startsWith("data: "))
          ?.slice("data: ".length)
      : body;
    if (!json) throw new Error("MCP response did not contain JSON");
    return JSON.parse(json) as Record<string, unknown>;
  } finally {
    await handler.close();
  }
}

async function callTool(
  operations: KioskOperations,
  name: string,
  args: Record<string, unknown> = {},
  activeCaller: McpCaller = caller,
) {
  const response = await rpc(
    operations,
    "tools/call",
    { name, arguments: args },
    activeCaller,
  );
  return response.result as {
    isError?: boolean;
    structuredContent?: Record<string, unknown>;
    content: { type: string; text: string }[];
  };
}

function modernRequest(
  method: string,
  params: Record<string, unknown> = {},
  signal?: AbortSignal,
): Request {
  return new Request("http://localhost/mcp", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "mcp-protocol-version": "2026-07-28",
      "mcp-method": method,
      ...(typeof params.name === "string" ? { "mcp-name": params.name } : {}),
    },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 7,
      method,
      params: {
        ...params,
        _meta: {
          [PROTOCOL_VERSION_META_KEY]: "2026-07-28",
          [CLIENT_CAPABILITIES_META_KEY]: {},
          [CLIENT_INFO_META_KEY]: { name: "kiosk-test", version: "1.0.0" },
        },
      },
    }),
    signal,
  });
}

describe("Kiosk MCP server", () => {
  it("lists the checked-in six-tool contract", async () => {
    const response = await rpc(fakeOperations(), "tools/list");
    const result = response.result as { tools: Record<string, unknown>[] };
    const tools = result.tools.map((tool) => ({
      name: tool.name,
      description: tool.description,
      inputSchema: tool.inputSchema,
      annotations: tool.annotations,
    }));
    expect(tools).toEqual(contract);
    expect(result.tools).toHaveLength(6);
  });

  it("calls every tool and returns structured content plus a JSON text fallback", async () => {
    const operations = fakeOperations();
    const calls = [
      ["publish_page", { html: "<h1>Demo</h1>" }],
      ["publish_page", { pageId: page.id, html: "<h1>Updated</h1>" }],
      ["list_pages", { limit: 10 }],
      ["get_page", { pageId: page.id }],
      ["set_page_visibility", { pageId: page.id, visibility: "public" }],
      ["delete_page", { pageId: page.id }],
      ["whoami", {}],
    ] as const;

    for (const [name, args] of calls) {
      const result = await callTool(operations, name, args);
      expect(result.isError).not.toBe(true);
      expect(result.structuredContent).toBeDefined();
      expect(JSON.parse(result.content[0].text)).toEqual(result.structuredContent);
      expect(result.content[0].text).not.toContain("contentHtml");
    }

    expect(operations.createPage).toHaveBeenCalledWith(caller, {
      html: "<h1>Demo</h1>",
    });
    expect(operations.updatePage).toHaveBeenCalledWith(caller, {
      pageId: page.id,
      html: "<h1>Updated</h1>",
    });
  });

  it("rejects unknown input fields and sanitizes unexpected failures", async () => {
    const operations = fakeOperations();
    const invalid = await callTool(operations, "get_page", {
      pageId: page.id,
      leaked: true,
    });
    expect(invalid.isError).toBe(true);
    expect(operations.getPage).not.toHaveBeenCalled();

    vi.mocked(operations.getPage).mockRejectedValueOnce(
      new Error("database password=do-not-leak"),
    );
    const failed = await callTool(operations, "get_page", { pageId: page.id });
    expect(failed.isError).toBe(true);
    expect(failed.content[0].text).toBe("Internal server error");
    expect(JSON.stringify(failed)).not.toContain("do-not-leak");
  });

  it("enforces the exact tool scope before calling an operation", async () => {
    const operations = fakeOperations();
    const restricted: McpCaller = { ...caller, scopes: ["pages:read"] };
    const listed = await callTool(operations, "list_pages", {}, restricted);
    expect(listed.isError).not.toBe(true);

    const denied = await callTool(
      operations,
      "publish_page",
      { html: "<h1>Denied</h1>" },
      restricted,
    );
    expect(denied.isError).toBe(true);
    expect(denied.content[0].text).toBe("Token does not grant the required scope");
    expect(operations.createPage).not.toHaveBeenCalled();
  });

  it("serves modern JSON and the stateless legacy fallback", async () => {
    const handler = createKioskMcpHandler(caller, fakeOperations());
    try {
      const modern = await handler.fetch(modernRequest("tools/list"));
      expect(modern.status).toBe(200);
      expect(modern.headers.get("content-type")).toContain("application/json");
      const body = await modern.json();
      expect(body.result.resultType).toBe("complete");
      expect(body.result.tools).toHaveLength(6);

      const legacy = await rpc(fakeOperations(), "tools/list");
      expect((legacy.result as { tools: unknown[] }).tools).toHaveLength(6);
    } finally {
      await handler.close();
    }
  });

  it("handles unknown tools, malformed JSON, and cancelled requests", async () => {
    const handler = createKioskMcpHandler(caller, fakeOperations());
    try {
      const unknown = await handler.fetch(
        modernRequest("tools/call", { name: "not_a_tool", arguments: {} }),
      );
      expect(JSON.stringify(await unknown.json())).not.toContain("stack");

      const malformed = await handler.fetch(
        new Request("http://localhost/mcp", {
          method: "POST",
          headers: {
            accept: "application/json, text/event-stream",
            "content-type": "application/json",
          },
          body: "{",
        }),
      );
      expect(malformed.status).toBe(400);

      const controller = new AbortController();
      controller.abort();
      const cancelled = await handler.fetch(
        modernRequest("tools/list", {}, controller.signal),
      );
      expect(cancelled.status).toBe(499);
    } finally {
      await handler.close();
    }
  });
});
