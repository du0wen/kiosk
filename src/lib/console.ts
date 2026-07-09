import { eq } from "drizzle-orm";
import { db } from "@/db";
import { member } from "@/db/schema";

/** The user's organization id (P1: single membership), or null. */
export async function resolveUserOrg(userId: string): Promise<string | null> {
  const [m] = await db
    .select()
    .from(member)
    .where(eq(member.userId, userId))
    .limit(1);
  return m?.organizationId ?? null;
}

/** Platform admins are configured via the KIOSK_ADMIN_EMAILS env allowlist. */
export function isAdminEmail(email: string | null | undefined): boolean {
  if (!email) return false;
  const list = (process.env.KIOSK_ADMIN_EMAILS ?? "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
  return list.includes(email.toLowerCase());
}
