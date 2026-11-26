import { afterEach, describe, expect, it } from "vitest";
import { DEFAULT_PROTECTION_POLICY, type ProtectionPolicy } from "./protection/policy";
import { createPage, softDeletePage, updatePage } from "./pages";
import { createToken, revokeToken } from "./token";
import { QuotaExceededError, getOrganizationUsage } from "./quota";
import { cleanupPrincipal, createPrincipal } from "@/test/factories";
import { db } from "@/db";
import { invitation } from "@/db/schema";
import { uuidv7 } from "./id";

let principal: Awaited<ReturnType<typeof createPrincipal>> | null = null;

function policy(quotas: Partial<ProtectionPolicy["quotas"]>): ProtectionPolicy {
  return {
    rateLimits: structuredClone(DEFAULT_PROTECTION_POLICY.rateLimits),
    quotas: { ...DEFAULT_PROTECTION_POLICY.quotas, ...quotas },
  };
}

afterEach(async () => {
  if (principal) await cleanupPrincipal(principal);
  principal = null;
});

describe("organization quota transactions", () => {
  it("serializes concurrent page creates at the final available slot", async () => {
    principal = await createPrincipal();
    const quotaPolicy = policy({ activePages: 1 });
    const create = (title: string) => createPage({
      organizationId: principal!.organizationId,
      userId: principal!.userId,
      html: `<title>${title}</title>`,
    }, { quotaPolicy });

    const results = await Promise.allSettled([create("A"), create("B")]);
    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    const rejected = results.find((result) => result.status === "rejected");
    expect(rejected && rejected.reason).toBeInstanceOf(QuotaExceededError);
    expect((await getOrganizationUsage(principal.organizationId)).activePages).toBe(1);
  });

  it("charges retained bytes only for content-changing versions", async () => {
    principal = await createPrincipal();
    const html = "<title>A</title>";
    const quotaPolicy = policy({ retainedBytes: Buffer.byteLength(html) });
    const page = await createPage({
      organizationId: principal.organizationId,
      userId: principal.userId,
      html,
    }, { quotaPolicy });

    await expect(updatePage({
      publicId: page.publicId,
      organizationId: principal.organizationId,
      userId: principal.userId,
      html,
      title: "Renamed",
    }, { quotaPolicy })).resolves.toBeTruthy();
    await expect(updatePage({
      publicId: page.publicId,
      organizationId: principal.organizationId,
      userId: principal.userId,
      html: `${html}x`,
    }, { quotaPolicy })).rejects.toBeInstanceOf(QuotaExceededError);
  });

  it("frees an active-page slot without removing retained history usage", async () => {
    principal = await createPrincipal();
    const page = await createPage({
      organizationId: principal.organizationId,
      userId: principal.userId,
      html: "<title>Retained</title>",
    });
    const before = await getOrganizationUsage(principal.organizationId);
    await softDeletePage({
      publicId: page.publicId,
      organizationId: principal.organizationId,
      userId: principal.userId,
    });
    const after = await getOrganizationUsage(principal.organizationId);
    expect(after.activePages).toBe(0);
    expect(after.retainedBytes).toBe(before.retainedBytes);
  });

  it("serializes concurrent token creates at the final available slot", async () => {
    principal = await createPrincipal();
    const quotaPolicy = policy({ activeTokens: 2 });
    const create = (name: string) => createToken({
      userId: principal!.userId,
      organizationId: principal!.organizationId,
      name,
    }, { quotaPolicy });

    const results = await Promise.allSettled([create("A"), create("B")]);
    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    expect(results.find((result) => result.status === "rejected")?.reason).toBeInstanceOf(
      QuotaExceededError,
    );
    expect((await getOrganizationUsage(principal.organizationId)).activeTokens).toBe(2);
  });

  it("allows a revoked token slot to be replaced", async () => {
    principal = await createPrincipal();
    const usage = await getOrganizationUsage(principal.organizationId);
    expect(usage.activeTokens).toBe(1);
    const token = await createToken({
      userId: principal.userId,
      organizationId: principal.organizationId,
      name: "replace-me",
    });
    await revokeToken(token.id, principal.organizationId);
    await expect(createToken({
      userId: principal.userId,
      organizationId: principal.organizationId,
      name: "replacement",
    }, { quotaPolicy: policy({ activeTokens: 2 }) })).resolves.toBeTruthy();
  });

  it("counts only pending invitations", async () => {
    principal = await createPrincipal();
    const base = {
      organizationId: principal.organizationId,
      inviterId: principal.userId,
      role: "member",
      expiresAt: new Date(Date.now() + 60_000),
      createdAt: new Date(),
    };
    await db.insert(invitation).values([
      { ...base, id: uuidv7(), email: `${uuidv7()}@t.local`, status: "pending" },
      { ...base, id: uuidv7(), email: `${uuidv7()}@t.local`, status: "accepted" },
      { ...base, id: uuidv7(), email: `${uuidv7()}@t.local`, status: "canceled" },
    ]);
    const usage = await getOrganizationUsage(principal.organizationId);
    expect(usage.members).toBe(1);
    expect(usage.invitations).toBe(1);
  });
});
