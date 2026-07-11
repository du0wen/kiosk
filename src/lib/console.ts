import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { member } from "@/db/schema";
import type { Role } from "@/lib/permissions";

/** The user's organization id (P1: single membership), or null. */
export async function resolveUserOrg(userId: string): Promise<string | null> {
  const [m] = await db
    .select()
    .from(member)
    .where(eq(member.userId, userId))
    .limit(1);
  return m?.organizationId ?? null;
}

/** The user's org id + role (for console authz), or null. */
export async function resolveUserOrgRole(
  userId: string,
): Promise<{ organizationId: string; role: Role } | null> {
  const [m] = await db
    .select({ organizationId: member.organizationId, role: member.role })
    .from(member)
    .where(eq(member.userId, userId))
    .limit(1);
  return m ? { organizationId: m.organizationId, role: m.role as Role } : null;
}

/** True if the user is a member of the given org. */
export async function isOrgMember(
  userId: string,
  organizationId: string,
): Promise<boolean> {
  const [m] = await db
    .select({ id: member.id })
    .from(member)
    .where(
      and(eq(member.userId, userId), eq(member.organizationId, organizationId)),
    )
    .limit(1);
  return !!m;
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
