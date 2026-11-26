import { and, desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { orgAuditLog, type OrgAuditLog } from "@/db/schema";
import { uuidv7 } from "@/lib/id";

export const AUDIT_ACTIONS = [
  "page.publish",
  "page.update",
  "page.visibility",
  "page.delete",
  "page.export",
  "template.create",
  "template.update",
  "template.restore",
  "template.delete",
  "org.branding",
  "org.security",
  "org.transfer",
  "org.delete",
  "member.invite",
  "member.role",
  "member.remove",
  "token.create",
  "token.revoke",
] as const;

export type AuditAction = (typeof AUDIT_ACTIONS)[number];

export async function recordOrgAuditEvent(input: {
  organizationId: string;
  actorUserId?: string | null;
  actorEmail?: string | null;
  action: AuditAction;
  targetType?: string | null;
  targetId?: string | null;
  summary?: string | null;
}): Promise<void> {
  try {
    await db.insert(orgAuditLog).values({
      id: uuidv7(),
      organizationId: input.organizationId,
      actorUserId: input.actorUserId ?? null,
      actorEmail: input.actorEmail ?? null,
      action: input.action,
      targetType: input.targetType ?? null,
      targetId: input.targetId ?? null,
      summary: input.summary?.slice(0, 300) ?? null,
    });
  } catch {
    // Best-effort: never break primary user flows if audit write fails transiently.
  }
}

export async function listOrgAuditLogs(params: {
  organizationId: string;
  action?: string | null;
  limit?: number;
}): Promise<OrgAuditLog[]> {
  const limit = Math.min(200, Math.max(1, params.limit ?? 50));
  const conditions = [eq(orgAuditLog.organizationId, params.organizationId)];
  if (params.action && (AUDIT_ACTIONS as readonly string[]).includes(params.action)) {
    conditions.push(eq(orgAuditLog.action, params.action));
  }
  return db
    .select()
    .from(orgAuditLog)
    .where(and(...conditions))
    .orderBy(desc(orgAuditLog.createdAt))
    .limit(limit);
}
