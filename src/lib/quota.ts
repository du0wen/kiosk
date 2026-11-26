import { sql, type SQL } from "drizzle-orm";
import { db } from "@/db";
import type { ProtectionPolicy } from "@/lib/protection/policy";
import { getProtectionRuntime } from "@/lib/protection/runtime";

export type OrganizationUsage = {
  activePages: number;
  retainedBytes: number;
  activeTokens: number;
  members: number;
  invitations: number;
};

export type OrganizationQuotaName = keyof OrganizationUsage;

export class QuotaExceededError extends Error {
  readonly code = "quota_exceeded";

  constructor(
    public readonly quota: OrganizationQuotaName,
    public readonly current: number,
    public readonly limit: number,
  ) {
    super(`${quota} quota exceeded (${current}/${limit})`);
    this.name = "QuotaExceededError";
  }
}

type QuotaExecutor = {
  execute(query: SQL): Promise<unknown>;
};

type UsageRow = {
  active_pages: number | string;
  retained_bytes: number | string;
  active_tokens: number | string;
  members: number | string;
  invitations: number | string;
};

function rowsOf(result: unknown): unknown[] {
  if (Array.isArray(result)) return result;
  if (result && typeof result === "object" && "rows" in result) {
    const rows = (result as { rows: unknown }).rows;
    if (Array.isArray(rows)) return rows;
  }
  throw new Error("Unexpected quota query result");
}

function policyOrDefault(policy?: Readonly<ProtectionPolicy>) {
  return policy ?? getProtectionRuntime().policy;
}

export function assertQuotaAvailable(
  quota: OrganizationQuotaName,
  usage: OrganizationUsage,
  additional: number,
  limit: number,
): void {
  const current = usage[quota];
  if (current + additional > limit) {
    throw new QuotaExceededError(quota, current, limit);
  }
}

export async function getOrganizationUsage(
  organizationId: string,
  executor: QuotaExecutor = db,
): Promise<OrganizationUsage> {
  const result = await executor.execute(sql`
    select
      (select count(*)::int from pages
        where organization_id = ${organizationId} and deleted_at is null) as active_pages,
      (select coalesce(sum(coalesce(pc.size_bytes, octet_length(pv.content_html))), 0)::bigint
        from page_version pv
        inner join pages p on p.id = pv.page_id
        left join page_content pc on pc.id = pv.content_id
        where p.organization_id = ${organizationId}) as retained_bytes,
      (select count(*)::int from api_token
        where organization_id = ${organizationId}
          and revoked_at is null
          and (expires_at is null or expires_at > now())) as active_tokens,
      (select count(*)::int from member
        where organization_id = ${organizationId}) as members,
      (select count(*)::int from invitation
        where organization_id = ${organizationId} and status = 'pending') as invitations
  `);
  const row = rowsOf(result)[0] as UsageRow | undefined;
  if (!row) throw new Error("Organization usage is unavailable");
  return {
    activePages: Number(row.active_pages),
    retainedBytes: Number(row.retained_bytes),
    activeTokens: Number(row.active_tokens),
    members: Number(row.members),
    invitations: Number(row.invitations),
  };
}

export async function lockOrganizationQuota(
  organizationId: string,
  executor: QuotaExecutor,
): Promise<void> {
  await executor.execute(sql`
    select id from organization where id = ${organizationId} for update
  `);
}

export async function assertPageCreateQuota(
  executor: QuotaExecutor,
  organizationId: string,
  contentBytes: number,
  policy?: Readonly<ProtectionPolicy>,
): Promise<void> {
  await lockOrganizationQuota(organizationId, executor);
  const usage = await getOrganizationUsage(organizationId, executor);
  const quotas = policyOrDefault(policy).quotas;
  assertQuotaAvailable("activePages", usage, 1, quotas.activePages);
  assertQuotaAvailable("retainedBytes", usage, contentBytes, quotas.retainedBytes);
}

export async function assertPageVersionQuota(
  executor: QuotaExecutor,
  organizationId: string,
  additionalBytes: number,
  policy?: Readonly<ProtectionPolicy>,
): Promise<void> {
  await lockOrganizationQuota(organizationId, executor);
  if (additionalBytes === 0) return;
  const usage = await getOrganizationUsage(organizationId, executor);
  assertQuotaAvailable(
    "retainedBytes",
    usage,
    additionalBytes,
    policyOrDefault(policy).quotas.retainedBytes,
  );
}

export async function assertTokenCreateQuota(
  executor: QuotaExecutor,
  organizationId: string,
  policy?: Readonly<ProtectionPolicy>,
): Promise<void> {
  await lockOrganizationQuota(organizationId, executor);
  const usage = await getOrganizationUsage(organizationId, executor);
  assertQuotaAvailable(
    "activeTokens",
    usage,
    1,
    policyOrDefault(policy).quotas.activeTokens,
  );
}
