import { handleMcpOptions, handleMcpPost } from "@/lib/mcp/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request): Promise<Response> {
  return handleMcpPost(request);
}

export function OPTIONS(request: Request): Response {
  return handleMcpOptions(request);
}

function methodNotAllowed(): Response {
  return new Response("Method not allowed.", {
    status: 405,
    headers: { allow: "POST, OPTIONS" },
  });
}

export async function GET(): Promise<Response> {
  return methodNotAllowed();
}

export async function DELETE(): Promise<Response> {
  return methodNotAllowed();
}
