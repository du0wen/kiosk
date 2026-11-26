export const SERVE_CSP = [
  "default-src 'none'",
  "script-src 'unsafe-inline' 'unsafe-eval' blob:",
  "style-src 'unsafe-inline'",
  "img-src data: blob:",
  "font-src data:",
  "media-src data: blob:",
  "connect-src 'none'",
  "form-action 'none'",
  "base-uri 'none'",
  "frame-src 'none'",
].join("; ");

/** Response headers for a served user page. Intentionally embeddable (no X-Frame-Options). */
export function servedPageHeaders(input: {
  visibility: "org" | "public";
  contentHash: string | null;
  error?: boolean;
}): Record<string, string> {
  const headers: Record<string, string> = {
    "content-type": "text/html; charset=utf-8",
    "content-security-policy": SERVE_CSP,
    "x-robots-tag": "noindex, nofollow",
    "x-content-type-options": "nosniff",
    "referrer-policy": "no-referrer",
    "cache-control": input.error || input.visibility === "org"
      ? "private, no-store"
      : "public, max-age=0, s-maxage=0, must-revalidate",
  };
  if (!input.error && input.visibility === "public" && input.contentHash && /^[a-f0-9]{64}$/.test(input.contentHash)) {
    headers.etag = `"sha256-${input.contentHash}"`;
  }
  return headers;
}

export function notFoundResponse(): Response {
  return new Response(
    "<!doctype html><meta name=viewport content='width=device-width'>" +
      "<meta name=robots content=noindex><title>Not found</title>" +
      "<h1>404 — page not found</h1>",
    {
      status: 404,
      headers: {
        "content-type": "text/html; charset=utf-8",
        "x-robots-tag": "noindex, nofollow",
      },
    },
  );
}

export type RouteDecision =
  | { type: "next" }
  | { type: "redirect"; url: string }
  | { type: "notFound" };

function hostOf(origin: string | undefined): string {
  if (!origin) return "";
  try {
    return new URL(origin).host;
  } catch {
    return origin;
  }
}

const SERVE_ALLOW = ["/report", "/favicon.ico", "/healthz"];

/** Decide how to route a request given its Host and path. Pure — unit-testable. */
export function routeForHost(p: {
  host: string;
  pathname: string;
  serveOrigin?: string;
}): RouteDecision {
  const serveOrigin = p.serveOrigin ?? process.env.SERVE_ORIGIN;
  const serveHost = hostOf(serveOrigin);
  const isServe = serveHost !== "" && p.host === serveHost;

  if (isServe) {
    if (
      p.pathname.startsWith("/p/") ||
      p.pathname.startsWith("/_next/") ||
      SERVE_ALLOW.includes(p.pathname)
    ) {
      return { type: "next" };
    }
    return { type: "notFound" };
  }

  // App origin (or unknown host): public page paths belong on the serve origin.
  if (p.pathname.startsWith("/p/")) {
    return { type: "redirect", url: `${serveOrigin ?? ""}${p.pathname}` };
  }
  return { type: "next" };
}
