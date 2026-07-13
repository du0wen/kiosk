import { getSession } from "@/lib/session";
import { resolveActiveOrg } from "@/lib/console";
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
  const session = await getSession();
  if (!session) return new Response("Unauthorized", { status: 401 });
  const org = await resolveActiveOrg(session);
  if (!org) return new Response("No organization", { status: 403 });
  const { id } = await params;
  const format = new URL(req.url).searchParams.get("format") ?? "";
  if (!isExportFormat(format)) return new Response("Bad format", { status: 400 });
  const page = await getPage({ publicId: id, organizationId: org });
  if (!page) return new Response("Not found", { status: 404 });
  try {
    const { exportWatermark } = await getOrgSettings(org);
    const { body, contentType, ext } = await exportPage(page, format, exportWatermark);
    return new Response(body as BodyInit, {
      status: 200,
      headers: {
        "content-type": contentType,
        "content-disposition": `attachment; filename="${exportFilename(page, ext)}"`,
      },
    });
  } catch (e) {
    const status = e instanceof ExportError ? e.status : 500;
    return new Response("Export failed", { status });
  }
}
