import { eq } from "drizzle-orm";
import { db } from "@/db";
import { orgSettings, organization } from "@/db/schema";
import {
  clampWatermarkOpacity,
  isWatermarkMode,
  isWatermarkScope,
  type WatermarkMode,
  type WatermarkScope,
} from "./watermark";

export function isHexColor(v: string): boolean {
  return /^#[0-9a-fA-F]{6}$/.test(v);
}

export type OrgSettingsView = {
  themeColor: string | null;
  exportWatermark: string | null;
  watermarkMode: WatermarkMode;
  watermarkScope: WatermarkScope;
  watermarkIncludeViewer: boolean;
  watermarkOpacity: number;
  allowPublicPages: boolean;
  allowMemberExport: boolean;
};

export async function getOrgSettings(
  organizationId: string,
): Promise<OrgSettingsView> {
  const [row] = await db
    .select({
      themeColor: orgSettings.themeColor,
      exportWatermark: orgSettings.exportWatermark,
      watermarkMode: orgSettings.watermarkMode,
      watermarkScope: orgSettings.watermarkScope,
      watermarkIncludeViewer: orgSettings.watermarkIncludeViewer,
      watermarkOpacity: orgSettings.watermarkOpacity,
      allowPublicPages: orgSettings.allowPublicPages,
      allowMemberExport: orgSettings.allowMemberExport,
    })
    .from(orgSettings)
    .where(eq(orgSettings.organizationId, organizationId))
    .limit(1);
  return {
    themeColor: row?.themeColor ?? null,
    exportWatermark: row?.exportWatermark ?? null,
    watermarkMode:
      row?.watermarkMode && isWatermarkMode(row.watermarkMode)
        ? row.watermarkMode
        : "footer",
    watermarkScope:
      row?.watermarkScope && isWatermarkScope(row.watermarkScope)
        ? row.watermarkScope
        : "org_only",
    watermarkIncludeViewer: row?.watermarkIncludeViewer ?? false,
    watermarkOpacity: clampWatermarkOpacity(row?.watermarkOpacity ?? 8),
    allowPublicPages: row?.allowPublicPages ?? true,
    allowMemberExport: row?.allowMemberExport ?? true,
  };
}

export async function setOrgSettings(
  organizationId: string,
  patch: Partial<{
    themeColor: string | null;
    exportWatermark: string | null;
    watermarkMode: WatermarkMode;
    watermarkScope: WatermarkScope;
    watermarkIncludeViewer: boolean;
    watermarkOpacity: number;
    allowPublicPages: boolean;
    allowMemberExport: boolean;
  }>,
): Promise<void> {
  if (typeof patch.themeColor === "string" && !isHexColor(patch.themeColor)) {
    throw new Error("themeColor must be #rrggbb");
  }
  if (patch.watermarkMode !== undefined && !isWatermarkMode(patch.watermarkMode)) {
    throw new Error("Invalid watermarkMode");
  }
  if (patch.watermarkScope !== undefined && !isWatermarkScope(patch.watermarkScope)) {
    throw new Error("Invalid watermarkScope");
  }

  const normalizedOpacity =
    patch.watermarkOpacity !== undefined
      ? clampWatermarkOpacity(patch.watermarkOpacity)
      : undefined;

  const set: Record<string, unknown> = { updatedAt: new Date() };
  if ("themeColor" in patch) set.themeColor = patch.themeColor;
  if ("exportWatermark" in patch) set.exportWatermark = patch.exportWatermark;
  if (patch.watermarkMode !== undefined) set.watermarkMode = patch.watermarkMode;
  if (patch.watermarkScope !== undefined) set.watermarkScope = patch.watermarkScope;
  if (patch.watermarkIncludeViewer !== undefined) {
    set.watermarkIncludeViewer = patch.watermarkIncludeViewer;
  }
  if (normalizedOpacity !== undefined) set.watermarkOpacity = normalizedOpacity;
  if (patch.allowPublicPages !== undefined) set.allowPublicPages = patch.allowPublicPages;
  if (patch.allowMemberExport !== undefined) {
    set.allowMemberExport = patch.allowMemberExport;
  }

  await db
    .insert(orgSettings)
    .values({
      organizationId,
      themeColor: patch.themeColor ?? null,
      exportWatermark: patch.exportWatermark ?? null,
      watermarkMode: patch.watermarkMode ?? "footer",
      watermarkScope: patch.watermarkScope ?? "org_only",
      watermarkIncludeViewer: patch.watermarkIncludeViewer ?? false,
      watermarkOpacity: normalizedOpacity ?? 8,
      allowPublicPages: patch.allowPublicPages ?? true,
      allowMemberExport: patch.allowMemberExport ?? true,
    })
    .onConflictDoUpdate({ target: orgSettings.organizationId, set });
}

export async function getOrgBranding(
  organizationId: string,
): Promise<{
  name: string | null;
  themeColor: string | null;
  exportWatermark: string | null;
  watermarkMode: WatermarkMode;
  watermarkScope: WatermarkScope;
  watermarkIncludeViewer: boolean;
  watermarkOpacity: number;
}> {
  const [row] = await db
    .select({
      name: organization.name,
      themeColor: orgSettings.themeColor,
      exportWatermark: orgSettings.exportWatermark,
      watermarkMode: orgSettings.watermarkMode,
      watermarkScope: orgSettings.watermarkScope,
      watermarkIncludeViewer: orgSettings.watermarkIncludeViewer,
      watermarkOpacity: orgSettings.watermarkOpacity,
    })
    .from(organization)
    .leftJoin(orgSettings, eq(orgSettings.organizationId, organization.id))
    .where(eq(organization.id, organizationId))
    .limit(1);
  return {
    name: row?.name ?? null,
    themeColor: row?.themeColor ?? null,
    exportWatermark: row?.exportWatermark ?? null,
    watermarkMode:
      row?.watermarkMode && isWatermarkMode(row.watermarkMode)
        ? row.watermarkMode
        : "footer",
    watermarkScope:
      row?.watermarkScope && isWatermarkScope(row.watermarkScope)
        ? row.watermarkScope
        : "org_only",
    watermarkIncludeViewer: row?.watermarkIncludeViewer ?? false,
    watermarkOpacity: clampWatermarkOpacity(row?.watermarkOpacity ?? 8),
  };
}
