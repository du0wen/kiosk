import { createHmac, timingSafeEqual } from "node:crypto";

const DEFAULT_TTL_MS = 120_000; // ~2 min

function secret(): string {
  return process.env.BETTER_AUTH_SECRET ?? "";
}

/** Short-lived signed grant that the serve origin trusts (issued by the app origin). */
export function signServeToken(
  orgId: string,
  userId: string,
  ttlMs: number = DEFAULT_TTL_MS,
): string {
  const payload = { o: orgId, u: userId, e: Date.now() + ttlMs };
  const b64 = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const sig = createHmac("sha256", secret()).update(b64).digest("base64url");
  return `${b64}.${sig}`;
}

export function verifyServeToken(
  token: string,
): { orgId: string; userId: string } | null {
  const dot = token.indexOf(".");
  if (dot < 0) return null;
  const b64 = token.slice(0, dot);
  const sig = token.slice(dot + 1);
  const expected = createHmac("sha256", secret()).update(b64).digest("base64url");
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  let obj: { o?: unknown; u?: unknown; e?: unknown };
  try {
    obj = JSON.parse(Buffer.from(b64, "base64url").toString("utf8"));
  } catch {
    return null;
  }
  if (
    typeof obj.o !== "string" ||
    typeof obj.u !== "string" ||
    typeof obj.e !== "number" ||
    Date.now() > obj.e
  ) {
    return null;
  }
  return { orgId: obj.o, userId: obj.u };
}
