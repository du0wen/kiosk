import { createMcpHandler, McpServer } from "@modelcontextprotocol/server";
import { z } from "zod";
import {
  kioskOperations,
  OperationError,
  type Caller,
  type KioskOperations,
  type PageMetadata,
} from "@/lib/page-operations";
import type { TokenScope } from "@/lib/token-scopes";
import { QuotaExceededError } from "@/lib/quota";

const pageId = z.string().regex(/^[0-9A-Za-z]{12}$/);
const visibility = z.enum(["org", "public"]);

const pageOutput = z.object({
  id: pageId,
  url: z.url(),
  rawUrl: z.url(),
  title: z.string().nullable(),
  visibility,
  sizeBytes: z.number().int().nonnegative(),
  viewCount: z.number().int().nonnegative(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
});

const toolDefinitions = {
  publish_page: {
    description: "Publish a new HTML page or update one by page ID.",
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: false,
      openWorldHint: false,
    },
  },
  list_pages: {
    description: "List page metadata in the current organization.",
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
  },
  get_page: {
    description: "Get metadata for one page without returning its HTML.",
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
  },
  set_page_visibility: {
    description: "Set a page to organization-private or public.",
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
  },
  delete_page: {
    description: "Soft-delete a page in the current organization.",
    annotations: {
      readOnlyHint: false,
      destructiveHint: true,
      idempotentHint: true,
      openWorldHint: false,
    },
  },
  whoami: {
    description: "Show the current user, organization, and role.",
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
  },
} as const;

function serializePage(page: PageMetadata) {
  return {
    ...page,
    createdAt: page.createdAt.toISOString(),
    updatedAt: page.updatedAt.toISOString(),
  };
}

function success<T extends Record<string, unknown>>(value: T) {
  return {
    content: [{ type: "text" as const, text: JSON.stringify(value) }],
    structuredContent: value,
  };
}

function failure(error: unknown) {
  const message =
    error instanceof OperationError || error instanceof QuotaExceededError
      ? error.message
      : "Internal server error";
  return {
    isError: true,
    content: [{ type: "text" as const, text: message }],
  };
}

async function runTool<T extends Record<string, unknown>>(
  caller: McpCaller,
  scope: TokenScope,
  operation: () => Promise<T>,
) {
  if (caller.scopes && !caller.scopes.includes(scope)) {
    return failure(new OperationError("forbidden", "Token does not grant the required scope"));
  }
  try {
    return success(await operation());
  } catch (error) {
    return failure(error);
  }
}

export function createKioskMcpServer(
  caller: McpCaller,
  operations: KioskOperations = kioskOperations,
): McpServer {
  const server = new McpServer({ name: "kiosk", version: "0.1.0" });

  server.registerTool(
    "publish_page",
    {
      ...toolDefinitions.publish_page,
      inputSchema: z
        .object({
          html: z.string().min(1),
          pageId: pageId.optional(),
          title: z.string().max(300).optional(),
          visibility: visibility.optional(),
        })
        .strict(),
      outputSchema: pageOutput,
    },
    async ({ html, pageId: targetPageId, title, visibility: targetVisibility }) =>
      runTool(caller, "pages:write", async () => {
        const result = targetPageId
          ? await operations.updatePage(caller, {
              pageId: targetPageId,
              html,
              ...(title !== undefined ? { title } : {}),
              ...(targetVisibility !== undefined
                ? { visibility: targetVisibility }
                : {}),
            })
          : await operations.createPage(caller, {
              html,
              ...(title !== undefined ? { title } : {}),
              ...(targetVisibility !== undefined
                ? { visibility: targetVisibility }
                : {}),
            });
        return serializePage(result);
      }),
  );

  server.registerTool(
    "list_pages",
    {
      ...toolDefinitions.list_pages,
      inputSchema: z
        .object({
          cursor: z.iso.datetime().optional(),
          limit: z.number().int().min(1).max(100).optional(),
        })
        .strict(),
      outputSchema: z.object({
        pages: z.array(pageOutput),
        nextCursor: z.iso.datetime().nullable(),
      }),
    },
    async ({ cursor, limit }) =>
      runTool(caller, "pages:read", async () => {
        const result = await operations.listPages(caller, { cursor, limit });
        return {
          pages: result.items.map(serializePage),
          nextCursor: result.nextCursor,
        };
      }),
  );

  server.registerTool(
    "get_page",
    {
      ...toolDefinitions.get_page,
      inputSchema: z.object({ pageId }).strict(),
      outputSchema: pageOutput,
    },
    async ({ pageId: targetPageId }) =>
      runTool(caller, "pages:read", async () =>
        serializePage(await operations.getPage(caller, targetPageId))),
  );

  server.registerTool(
    "set_page_visibility",
    {
      ...toolDefinitions.set_page_visibility,
      inputSchema: z.object({ pageId, visibility }).strict(),
      outputSchema: pageOutput,
    },
    async ({ pageId: targetPageId, visibility: targetVisibility }) =>
      runTool(caller, "pages:write", async () =>
        serializePage(
          await operations.setPageVisibility(caller, {
            pageId: targetPageId,
            visibility: targetVisibility,
          }),
        ),
      ),
  );

  server.registerTool(
    "delete_page",
    {
      ...toolDefinitions.delete_page,
      inputSchema: z.object({ pageId }).strict(),
      outputSchema: z.object({ id: pageId, deleted: z.literal(true) }),
    },
    async ({ pageId: targetPageId }) =>
      runTool(caller, "pages:write", () => operations.deletePage(caller, targetPageId)),
  );

  server.registerTool(
    "whoami",
    {
      ...toolDefinitions.whoami,
      inputSchema: z.object({}).strict(),
      outputSchema: z.object({
        user: z
          .object({ id: z.string(), name: z.string(), email: z.email() })
          .nullable(),
        organization: z
          .object({ id: z.string(), name: z.string(), slug: z.string() })
          .nullable(),
        role: z.enum(["owner", "admin", "member"]),
      }),
    },
    async () => runTool(caller, "identity:read", () => operations.getCallerProfile(caller)),
  );

  return server;
}

export function createKioskMcpHandler(
  caller: McpCaller,
  operations: KioskOperations = kioskOperations,
) {
  return createMcpHandler(() => createKioskMcpServer(caller, operations), {
    legacy: "stateless",
    responseMode: "auto",
  });
}

export type McpCaller = Caller & { scopes?: TokenScope[] };
