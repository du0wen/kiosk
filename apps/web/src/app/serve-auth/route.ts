import { auth } from "@/lib/auth";
import { getPublicPage } from "@/lib/pages";
import { isOrgMember } from "@/lib/console";
import { signServeToken } from "@/lib/serve-token";

/**
 * App-origin gate for org-only pages. The serve origin (cookieless) bounces
 * unauthenticated /p requests here; we check session + membership and hand back
 * a short-lived signed token to the serve origin. No cookie is set on serve.
 * Reads the session from the request's own headers (works in a route handler
 * and is unit-testable) rather than the request-scoped headers() global.
 */
export async function GET(req: Request): Promise<Response> {
  const next = new URL(req.url).searchParams.get("next");
  if (!next) return new Response("Missing next", { status: 400 });

  const session = await auth.api.getSession({ headers: req.headers });
  if (!session) {
    const callback = `/serve-auth?next=${encodeURIComponent(next)}`;
    return Response.redirect(
      `${process.env.APP_ORIGIN}/sign-in?callback=${encodeURIComponent(callback)}`,
      302,
    );
  }

  const page = await getPublicPage(next);
  if (!page) return new Response("Not found", { status: 404 });

  if (page.visibility === "public") {
    return Response.redirect(`${process.env.SERVE_ORIGIN}/p/${next}`, 302);
  }

  if (!(await isOrgMember(session.user.id, page.organizationId))) {
    return new Response("You do not have access to this page.", { status: 403 });
  }

  const k = signServeToken(page.organizationId, session.user.id);
  return Response.redirect(
    `${process.env.SERVE_ORIGIN}/p/${next}?k=${encodeURIComponent(k)}`,
    302,
  );
}
