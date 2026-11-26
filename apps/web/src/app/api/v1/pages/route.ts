import { errorResponse, json } from "@/lib/api";
import { requireApiAccess } from "@/lib/protection/api-access";
import {
  createPageForCaller,
  listPagesForCaller,
} from "@/lib/page-operations";

function parseVisibility(v: string | null): "org" | "public" | undefined {
  if (v === "org" || v === "public") return v;
  return undefined;
}

export async function POST(req: Request): Promise<Response> {
  try {
    const caller = await requireApiAccess(req, {
      scope: "pages:write",
      policy: "apiWrite",
    });
    const html = await req.text();
    const title = req.headers.get("x-kiosk-title");
    const visibility = parseVisibility(req.headers.get("x-kiosk-visibility"));
    const page = await createPageForCaller(caller, {
      html,
      title: title ?? undefined,
      visibility,
    });
    return json(
      {
        id: page.id,
        url: page.url,
        rawUrl: page.rawUrl,
        visibility: page.visibility,
        createdAt: page.createdAt,
      },
      201,
    );
  } catch (e) {
    return errorResponse(e);
  }
}

export async function GET(req: Request): Promise<Response> {
  try {
    const caller = await requireApiAccess(req, { scope: "pages:read" });
    const cursor = new URL(req.url).searchParams.get("cursor");
    const { items, nextCursor } = await listPagesForCaller(caller, { cursor });
    return json({
      pages: items.map((p) => ({
        id: p.id,
        url: p.url,
        rawUrl: p.rawUrl,
        title: p.title,
        sizeBytes: p.sizeBytes,
        viewCount: p.viewCount,
        createdAt: p.createdAt,
        updatedAt: p.updatedAt,
      })),
      nextCursor,
    });
  } catch (e) {
    return errorResponse(e);
  }
}
