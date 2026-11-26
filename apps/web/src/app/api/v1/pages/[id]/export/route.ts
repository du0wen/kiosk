import { errorResponse, ApiError } from "@/lib/api";
import { requireApiAccess } from "@/lib/protection/api-access";
import { getPage, getPageContent } from "@/lib/pages";
import { getOrgBranding, getOrgSettings } from "@/lib/org-settings";
import { protectRender } from "@/lib/protection/render";
import { resolveWatermarkDisplay } from "@/lib/watermark";
import {
  exportPage,
  isExportFormat,
  exportFilename,
  ExportError,
} from "@/lib/export";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(req: Request, { params }: Ctx): Promise<Response> {
  try {
    const { organizationId, role } = await requireApiAccess(req, {
      scope: "pages:export",
      policy: "apiExport",
    });
    const { id } = await params;
    const format = new URL(req.url).searchParams.get("format") ?? "";
    if (!isExportFormat(format)) {
      throw new ApiError(400, "bad_request", "format must be md|html|pdf|png|jpeg");
    }
    const page = await getPage({ publicId: id, organizationId });
    if (!page) throw new ApiError(404, "not_found", "Page not found");
    const settings = await getOrgSettings(organizationId);
    if (!settings.allowMemberExport && role === "member") {
      throw new ApiError(403, "forbidden", "Exports are restricted to organization owners and admins");
    }
    try {
      const brand = await getOrgBranding(organizationId);
      const wm = resolveWatermarkDisplay({
        mode: settings.watermarkMode,
        scope: settings.watermarkScope,
        text: settings.exportWatermark,
        orgName: brand.name,
        includeViewer: false,
        opacity: settings.watermarkOpacity,
        visibility: page.visibility === "public" ? "public" : "org",
      });
      const contentHtml = await getPageContent(page);
      const operation = () =>
        exportPage(
          { ...page, contentHtml },
          format,
          wm.active ? wm.label : null,
          wm.active ? { mode: wm.mode, opacity: wm.opacity } : undefined,
        );
      const { body, contentType, ext } =
        format === "pdf" || format === "png" || format === "jpeg"
          ? await protectRender(organizationId, operation)
          : await operation();
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
