import { NextResponse } from "next/server";
import { ApiError, errorResponse } from "@/lib/api";
import { requireApiAccess } from "@/lib/protection/api-access";
import { getOrgTemplateBySlug } from "@/lib/templates";

type Ctx = { params: Promise<{ slug: string }> };

export async function GET(req: Request, { params }: Ctx): Promise<Response> {
  try {
    const { organizationId } = await requireApiAccess(req, {
      scope: "pages:read",
    });
    const { slug } = await params;
    const versionParam = new URL(req.url).searchParams.get("version");
    const version = versionParam ? Number(versionParam) : undefined;
    if (version !== undefined && (!Number.isInteger(version) || version < 1)) {
      throw new ApiError(400, "bad_request", "version must be a positive integer");
    }

    const found = await getOrgTemplateBySlug({ organizationId, slug, version });
    if (!found) {
      throw new ApiError(404, "not_found", "Template not found");
    }

    return NextResponse.json({
      slug: found.template.slug,
      name: found.template.name,
      category: found.template.category,
      description: found.template.description,
      version: found.versionNumber,
      isDefault: found.template.isDefault,
      promptGuidelines: found.promptGuidelines,
      html: found.html,
      updatedAt: found.template.updatedAt.toISOString(),
    });
  } catch (e) {
    return errorResponse(e);
  }
}
