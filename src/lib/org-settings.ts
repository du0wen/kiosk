import { eq } from "drizzle-orm";
import { db } from "@/db";
import { orgSettings, organization } from "@/db/schema";

export function isHexColor(v: string): boolean {
  return /^#[0-9a-fA-F]{6}$/.test(v);
}

export async function getOrgSettings(
  organizationId: string,
): Promise<{ themeColor: string | null; exportWatermark: string | null }> {
  const [row] = await db
    .select({
      themeColor: orgSettings.themeColor,
      exportWatermark: orgSettings.exportWatermark,
    })
    .from(orgSettings)
    .where(eq(orgSettings.organizationId, organizationId))
    .limit(1);
  return {
    themeColor: row?.themeColor ?? null,
    exportWatermark: row?.exportWatermark ?? null,
  };
}

export async function setOrgSettings(
  organizationId: string,
  patch: { themeColor?: string | null; exportWatermark?: string | null },
): Promise<void> {
  if (typeof patch.themeColor === "string" && !isHexColor(patch.themeColor)) {
    throw new Error("themeColor must be #rrggbb");
  }
  const set: Record<string, unknown> = { updatedAt: new Date() };
  if ("themeColor" in patch) set.themeColor = patch.themeColor;
  if ("exportWatermark" in patch) set.exportWatermark = patch.exportWatermark;
  await db
    .insert(orgSettings)
    .values({
      organizationId,
      themeColor: patch.themeColor ?? null,
      exportWatermark: patch.exportWatermark ?? null,
    })
    .onConflictDoUpdate({ target: orgSettings.organizationId, set });
}

export async function getOrgBranding(
  organizationId: string,
): Promise<{ name: string | null; themeColor: string | null }> {
  const [row] = await db
    .select({ name: organization.name, themeColor: orgSettings.themeColor })
    .from(organization)
    .leftJoin(orgSettings, eq(orgSettings.organizationId, organization.id))
    .where(eq(organization.id, organizationId))
    .limit(1);
  return { name: row?.name ?? null, themeColor: row?.themeColor ?? null };
}
