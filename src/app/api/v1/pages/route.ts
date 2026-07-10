import { requireToken, errorResponse, json, ApiError } from "@/lib/api";
import { createPage, listPages, pageUrl, PageTooLargeError } from "@/lib/pages";

function parseVisibility(v: string | null): "org" | "public" | undefined {
  if (v === "org" || v === "public") return v;
  return undefined;
}

export async function POST(req: Request): Promise<Response> {
  try {
    const { userId, organizationId } = await requireToken(req);
    const html = await req.text();
    if (!html.trim()) throw new ApiError(400, "bad_request", "Empty body");
    const title = req.headers.get("x-kiosk-title");
    const visibility = parseVisibility(req.headers.get("x-kiosk-visibility"));
    try {
      const page = await createPage({
        organizationId,
        userId,
        html,
        title: title ?? undefined,
        visibility,
      });
      return json(
        {
          id: page.publicId,
          url: pageUrl(page.publicId),
          visibility: page.visibility,
          createdAt: page.createdAt,
        },
        201,
      );
    } catch (e) {
      if (e instanceof PageTooLargeError) throw new ApiError(413, "too_large", e.message);
      throw e;
    }
  } catch (e) {
    return errorResponse(e);
  }
}

export async function GET(req: Request): Promise<Response> {
  try {
    const { organizationId } = await requireToken(req);
    const cursor = new URL(req.url).searchParams.get("cursor");
    const { items, nextCursor } = await listPages({ organizationId, cursor });
    return json({
      pages: items.map((p) => ({
        id: p.publicId,
        url: pageUrl(p.publicId),
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
