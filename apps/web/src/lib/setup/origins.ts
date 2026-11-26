function firstHeaderToken(value: string | null): string | null {
  if (!value) return null;
  const token = value.split(",")[0]?.trim();
  return token || null;
}

export function resolveRequestOrigin(req: Request): string {
  const fallback = new URL(req.url).origin;
  const forwardedHost = firstHeaderToken(req.headers.get("x-forwarded-host"));
  const host = forwardedHost ?? firstHeaderToken(req.headers.get("host"));
  if (!host) return fallback;

  const forwardedProto = firstHeaderToken(req.headers.get("x-forwarded-proto"))?.toLowerCase();
  const proto =
    forwardedProto === "https" || forwardedProto === "http"
      ? forwardedProto
      : new URL(req.url).protocol.replace(":", "");

  try {
    return new URL(`${proto}://${host}`).origin;
  } catch {
    return fallback;
  }
}

export function suggestServeOrigin(appOrigin: string): string {
  try {
    const parsed = new URL(appOrigin);
    const port = parsed.port ? `:${parsed.port}` : "";
    if (parsed.hostname === "localhost") {
      return `${parsed.protocol}//127.0.0.1${port}`;
    }
    if (parsed.hostname === "127.0.0.1") {
      return `${parsed.protocol}//localhost${port}`;
    }
    return "";
  } catch {
    return "";
  }
}
