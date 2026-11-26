import { errorResponse, json, ApiError } from "@/lib/api";
import { requireApiAccess } from "@/lib/protection/api-access";
import {
  deletePageForCaller,
  getPageForCaller,
  setPageVisibilityForCaller,
  updatePageForCaller,
} from "@/lib/page-operations";

type Ctx = { params: Promise<{ id: string }> };

function parseVisibility(v: string | null): "org" | "public" | undefined {
  if (v === "org" || v === "public") return v;
  return undefined;
}

export async function GET(req: Request, { params }: Ctx): Promise<Response> {
  try {
    const caller = await requireApiAccess(req, { scope: "pages:read" });
    const { id } = await params;
    const page = await getPageForCaller(caller, id);
    return json({
      id: page.id,
      url: page.url,
      rawUrl: page.rawUrl,
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
    const caller = await requireApiAccess(req, {
      scope: "pages:write",
      policy: "apiWrite",
    });
    const { id } = await params;
    const html = await req.text();
    const title = req.headers.get("x-kiosk-title");
    const visibility = parseVisibility(req.headers.get("x-kiosk-visibility"));
    const page = await updatePageForCaller(caller, {
      pageId: id,
      html,
      title: title ?? undefined,
      visibility,
    });
    return json({
      id: page.id,
      url: page.url,
      rawUrl: page.rawUrl,
      visibility: page.visibility,
      updatedAt: page.updatedAt,
    });
  } catch (e) {
    return errorResponse(e);
  }
}

export async function PATCH(req: Request, { params }: Ctx): Promise<Response> {
  try {
    const caller = await requireApiAccess(req, {
      scope: "pages:write",
      policy: "apiWrite",
    });
    const { id } = await params;
    const body = (await req.json().catch(() => ({}))) as { visibility?: unknown };
    const visibility = parseVisibility(
      typeof body.visibility === "string" ? body.visibility : null,
    );
    if (!visibility) {
      throw new ApiError(400, "bad_request", "visibility must be 'org' or 'public'");
    }
    const updated = await setPageVisibilityForCaller(caller, {
      pageId: id,
      visibility,
    });
    return json({
      id: updated.id,
      url: updated.url,
      rawUrl: updated.rawUrl,
      visibility: updated.visibility,
    });
  } catch (e) {
    return errorResponse(e);
  }
}

export async function DELETE(req: Request, { params }: Ctx): Promise<Response> {
  try {
    const caller = await requireApiAccess(req, {
      scope: "pages:write",
      policy: "apiWrite",
    });
    const { id } = await params;
    await deletePageForCaller(caller, id);
    return new Response(null, { status: 204 });
  } catch (e) {
    return errorResponse(e);
  }
}
