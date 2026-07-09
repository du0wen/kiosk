import { and, eq, gt, isNull } from "drizzle-orm";
import { createHash, randomBytes } from "node:crypto";
import { db } from "@/db";
import { cliAuthCode, member } from "@/db/schema";
import { createToken } from "@/lib/token";

const CODE_TTL_MS = 2 * 60 * 1000;

export class CliAuthError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CliAuthError";
  }
}

export function isLoopback(redirectUri: string): boolean {
  try {
    const u = new URL(redirectUri);
    const host = u.hostname;
    return (
      (u.protocol === "http:" || u.protocol === "https:") &&
      (host === "127.0.0.1" || host === "localhost" || host === "::1")
    );
  } catch {
    return false;
  }
}

function hash(code: string): string {
  return createHash("sha256").update(code).digest("hex");
}

export async function createCliAuthCode(params: {
  userId: string;
  redirectUri: string;
}): Promise<string> {
  if (!isLoopback(params.redirectUri)) {
    throw new CliAuthError("redirect_uri must be a loopback address");
  }
  const [m] = await db
    .select()
    .from(member)
    .where(eq(member.userId, params.userId))
    .limit(1);
  if (!m) throw new CliAuthError("no organization for user");
  const code = randomBytes(32).toString("base64url");
  await db.insert(cliAuthCode).values({
    codeHash: hash(code),
    userId: params.userId,
    organizationId: m.organizationId,
    redirectUri: params.redirectUri,
    expiresAt: new Date(Date.now() + CODE_TTL_MS),
  });
  return code;
}

export async function exchangeCliAuthCode(
  code: string,
  deviceName = "CLI",
): Promise<{ token: string }> {
  const [row] = await db
    .select()
    .from(cliAuthCode)
    .where(
      and(
        eq(cliAuthCode.codeHash, hash(code)),
        isNull(cliAuthCode.usedAt),
        gt(cliAuthCode.expiresAt, new Date()),
      ),
    )
    .limit(1);
  if (!row) throw new CliAuthError("invalid or expired code");
  await db
    .update(cliAuthCode)
    .set({ usedAt: new Date() })
    .where(eq(cliAuthCode.id, row.id));
  const { plaintext } = await createToken({
    userId: row.userId,
    organizationId: row.organizationId,
    name: deviceName,
  });
  return { token: plaintext };
}
