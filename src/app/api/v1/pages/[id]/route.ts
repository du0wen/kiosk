import { requireToken, errorResponse, json, ApiError } from "@/lib/api";
import {
  getPage,
  updatePage,
  softDeletePage,
  pageUrl,
  PageTooLargeError,
} from "@/lib/pages";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(req: Request, { params }: Ctx): Promise<Response> {
  try {
    const { organizationId } = await requireToken(req);
    const { id } = await params;
    const page = await getPage({ publicId: id, organizationId });
    if (!page) throw new ApiError(404, "not_found", "Page not found");
    return json({
      id: page.publicId,
      url: pageUrl(page.publicId),
      title: page.title,
      sizeBytes: page.sizeBytes,
      viewCount: page.viewCount,
      createdAt: page.createdAt,
      updatedAt: page.updatedAt,
    });
  } catch (e) {
    return errorResponse(e);
  }
}

export async function PUT(req: Request, { params }: Ctx): Promise<Response> {
  try {
    const { organizationId } = await requireToken(req);
    const { id } = await params;
    const html = await req.text();
    if (!html.trim()) throw new ApiError(400, "bad_request", "Empty body");
    const title = req.headers.get("x-kiosk-title");
    try {
      const page = await updatePage({
        publicId: id,
        organizationId,
        html,
        title: title ?? undefined,
      });
      if (!page) throw new ApiError(404, "not_found", "Page not found");
      return json({
        id: page.publicId,
        url: pageUrl(page.publicId),
        updatedAt: page.updatedAt,
      });
    } catch (e) {
      if (e instanceof PageTooLargeError) throw new ApiError(413, "too_large", e.message);
      throw e;
    }
  } catch (e) {
    return errorResponse(e);
  }
}

export async function DELETE(req: Request, { params }: Ctx): Promise<Response> {
  try {
    const { organizationId } = await requireToken(req);
    const { id } = await params;
    const ok = await softDeletePage({ publicId: id, organizationId });
    if (!ok) throw new ApiError(404, "not_found", "Page not found");
    return new Response(null, { status: 204 });
  } catch (e) {
    return errorResponse(e);
  }
}
