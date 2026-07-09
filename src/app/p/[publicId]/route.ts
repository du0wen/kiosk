import { getPublicPage, incrementViewCount } from "@/lib/pages";
import { servedPageHeaders, notFoundResponse } from "@/lib/serving";

type Ctx = { params: Promise<{ publicId: string }> };

export async function GET(_req: Request, { params }: Ctx): Promise<Response> {
  const { publicId } = await params;
  const page = await getPublicPage(publicId);
  if (!page) return notFoundResponse();
  // Best-effort; do not block the response on the counter write.
  void incrementViewCount(page.id).catch(() => {});
  return new Response(page.contentHtml, { headers: servedPageHeaders() });
}
