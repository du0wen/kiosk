import { getSession } from "@/lib/session";
import { resolveActiveOrg, roleInOrg } from "@/lib/console";
import { getPage, getPageContent } from "@/lib/pages";
import { getOrgBranding, getOrgSettings } from "@/lib/org-settings";
import { resolveWatermarkDisplay } from "@/lib/watermark";
import {
  exportPage,
  isExportFormat,
  exportFilename,
  ExportError,
} from "@/lib/export";
import { ContentRepositoryError } from "@/lib/storage/content-repository";
import { protectionErrorResponse } from "@/lib/protection/http";
import { protectRender } from "@/lib/protection/render";

type Ctx = { params: Promise<{ pageId: string }> };

export async function GET(req: Request, { params }: Ctx): Promise<Response> {
  const session = await getSession();
  if (!session) return new Response("Unauthorized", { status: 401 });
  const org = await resolveActiveOrg(session);
  if (!org) return new Response("No organization", { status: 403 });
  const { pageId: id } = await params;
  const format = new URL(req.url).searchParams.get("format") ?? "";
  if (!isExportFormat(format)) return new Response("Bad format", { status: 400 });
  const page = await getPage({ publicId: id, organizationId: org });
  if (!page) return new Response("Not found", { status: 404 });
  const role = await roleInOrg(session.user.id, org);
  const settings = await getOrgSettings(org);
  if (!settings.allowMemberExport && role === "member") {
    return new Response("Forbidden", { status: 403 });
  }
  try {
    const brand = await getOrgBranding(org);
    const wm = resolveWatermarkDisplay({
      mode: settings.watermarkMode,
      scope: settings.watermarkScope,
      text: settings.exportWatermark,
      orgName: brand.name,
      includeViewer: settings.watermarkIncludeViewer,
      opacity: settings.watermarkOpacity,
      visibility: page.visibility === "public" ? "public" : "org",
      viewerEmail: session.user.email,
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
        ? await protectRender(org, operation)
        : await operation();
    return new Response(body as BodyInit, {
      status: 200,
      headers: {
        "content-type": contentType,
        "content-disposition": `attachment; filename="${exportFilename(page, ext)}"`,
      },
    });
  } catch (e) {
    const protectionResponse = protectionErrorResponse(e);
    if (protectionResponse) return protectionResponse;
    const status =
      e instanceof ExportError
        ? e.status
        : e instanceof ContentRepositoryError && e.code === "storage_unavailable"
          ? 503
          : 500;
    return new Response("Export failed", { status });
  }
}
