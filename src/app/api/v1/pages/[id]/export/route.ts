import { requireToken, errorResponse, ApiError } from "@/lib/api";
import { getPage } from "@/lib/pages";
import { getOrgSettings } from "@/lib/org-settings";
import {
  exportPage,
  isExportFormat,
  exportFilename,
  ExportError,
} from "@/lib/export";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(req: Request, { params }: Ctx): Promise<Response> {
  try {
    const { organizationId } = await requireToken(req);
    const { id } = await params;
    const format = new URL(req.url).searchParams.get("format") ?? "";
    if (!isExportFormat(format)) {
      throw new ApiError(400, "bad_request", "format must be md|html|pdf|png|jpeg");
    }
    const page = await getPage({ publicId: id, organizationId });
    if (!page) throw new ApiError(404, "not_found", "Page not found");
    try {
      const { exportWatermark } = await getOrgSettings(organizationId);
      const { body, contentType, ext } = await exportPage(page, format, exportWatermark);
      return new Response(body as BodyInit, {
        status: 200,
        headers: {
          "content-type": contentType,
          "content-disposition": `attachment; filename="${exportFilename(page, ext)}"`,
        },
      });
    } catch (e) {
      if (e instanceof ExportError) throw new ApiError(e.status, "export_failed", e.message);
      throw e;
    }
  } catch (e) {
    return errorResponse(e);
  }
}
