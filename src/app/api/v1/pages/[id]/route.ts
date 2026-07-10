import { requireToken, errorResponse, json, ApiError } from "@/lib/api";
import {
  getPage,
  updatePage,
  softDeletePage,
  setPageVisibility,
  pageUrl,
  PageTooLargeError,
} from "@/lib/pages";
import { can } from "@/lib/permissions";

type Ctx = { params: Promise<{ id: string }> };

function parseVisibility(v: string | null): "org" | "public" | undefined {
  if (v === "org" || v === "public") return v;
  return undefined;
}

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
      visibility: page.visibility,
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
    const { userId, organizationId } = await requireToken(req);
    const { id } = await params;
    const html = await req.text();
    if (!html.trim()) throw new ApiError(400, "bad_request", "Empty body");
    const title = req.headers.get("x-kiosk-title");
    const visibility = parseVisibility(req.headers.get("x-kiosk-visibility"));
    try {
      const page = await updatePage({
        publicId: id,
        organizationId,
        userId,
        html,
        title: title ?? undefined,
        visibility,
      });
      if (!page) throw new ApiError(404, "not_found", "Page not found");
      return json({
        id: page.publicId,
        url: pageUrl(page.publicId),
        visibility: page.visibility,
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

export async function PATCH(req: Request, { params }: Ctx): Promise<Response> {
  try {
    const { userId, organizationId, role } = await requireToken(req);
    const { id } = await params;
    const body = (await req.json().catch(() => ({}))) as { visibility?: unknown };
    const visibility = parseVisibility(
      typeof body.visibility === "string" ? body.visibility : null,
    );
    if (!visibility) {
      throw new ApiError(400, "bad_request", "visibility must be 'org' or 'public'");
    }
    const page = await getPage({ publicId: id, organizationId });
    if (!page) throw new ApiError(404, "not_found", "Page not found");
    if (!can(role, "page.setVisibility", { isResourceOwner: page.createdBy === userId })) {
      throw new ApiError(403, "forbidden", "Not allowed to change this page");
    }
    const updated = await setPageVisibility({ publicId: id, organizationId, userId, visibility });
    return json({
      id: updated!.publicId,
      url: pageUrl(updated!.publicId),
      visibility: updated!.visibility,
    });
  } catch (e) {
    return errorResponse(e);
  }
}

export async function DELETE(req: Request, { params }: Ctx): Promise<Response> {
  try {
    const { userId, organizationId, role } = await requireToken(req);
    const { id } = await params;
    const page = await getPage({ publicId: id, organizationId });
    if (!page) throw new ApiError(404, "not_found", "Page not found");
    if (!can(role, "page.delete", { isResourceOwner: page.createdBy === userId })) {
      throw new ApiError(403, "forbidden", "Not allowed to delete this page");
    }
    await softDeletePage({ publicId: id, organizationId, userId });
    return new Response(null, { status: 204 });
  } catch (e) {
    return errorResponse(e);
  }
}
