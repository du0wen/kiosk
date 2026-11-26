import { NextResponse } from "next/server";
import { errorResponse } from "@/lib/api";
import { requireApiAccess } from "@/lib/protection/api-access";
import { listOrgTemplates } from "@/lib/templates";

export async function GET(req: Request): Promise<Response> {
  try {
    const { organizationId } = await requireApiAccess(req, {
      scope: "pages:read",
    });
    const category = new URL(req.url).searchParams.get("category");
    const rows = await listOrgTemplates({ organizationId, category });
    return NextResponse.json({
      templates: rows.map((row) => ({
        slug: row.slug,
        name: row.name,
        category: row.category,
        description: row.description,
        promptGuidelines: row.promptGuidelines,
        version: row.currentVersion,
        isDefault: row.isDefault,
        updatedAt: row.updatedAt.toISOString(),
      })),
    });
  } catch (e) {
    return errorResponse(e);
  }
}
