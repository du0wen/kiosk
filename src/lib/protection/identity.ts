import { createHmac } from "node:crypto";
import { isIP } from "node:net";

export function extractClientIp(
  headers: Headers,
  trustedHeaders: readonly string[],
): string {
  for (const name of trustedHeaders) {
    const candidate = headers.get(name)?.split(",", 1)[0]?.trim();
    if (candidate && isIP(candidate) !== 0) return candidate;
  }
  return "unknown";
}

export function hashProtectionIdentifier(
  base64Key: string,
  domain: string,
  ...parts: string[]
): string {
  const key = Buffer.from(base64Key, "base64");
  if (key.length !== 32 || key.toString("base64") !== base64Key) {
    throw new Error("Invalid protection key");
  }
  const hmac = createHmac("sha256", key);
  for (const value of [domain, ...parts]) {
    hmac.update(String(Buffer.byteLength(value)));
    hmac.update(":");
    hmac.update(value);
    hmac.update(";");
  }
  return hmac.digest("hex");
}
