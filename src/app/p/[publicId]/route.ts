import { getPublicPage, incrementViewCount } from "@/lib/pages";
import { servedPageHeaders, notFoundResponse } from "@/lib/serving";
import { verifyServeToken } from "@/lib/serve-token";

type Ctx = { params: Promise<{ publicId: string }> };

export async function GET(req: Request, { params }: Ctx): Promise<Response> {
  const { publicId } = await params;
  const page = await getPublicPage(publicId);
  if (!page) return notFoundResponse();

  if (page.visibility !== "public") {
    // org-only: require a valid, unexpired token minted for this page's org.
    const k = new URL(req.url).searchParams.get("k") ?? "";
    const grant = verifyServeToken(k);
    if (!grant || grant.orgId !== page.organizationId) {
      const url = `${process.env.APP_ORIGIN}/serve-auth?next=${encodeURIComponent(publicId)}`;
      return Response.redirect(url, 302);
    }
  }

  // Best-effort; do not block the response on the counter write.
  void incrementViewCount(page.id).catch(() => {});
  return new Response(page.contentHtml, { headers: servedPageHeaders() });
}
