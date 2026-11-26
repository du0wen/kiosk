export const WATERMARK_MODES = ["off", "footer", "fullpage"] as const;
export type WatermarkMode = (typeof WATERMARK_MODES)[number];

export const WATERMARK_SCOPES = ["org_only", "all"] as const;
export type WatermarkScope = (typeof WATERMARK_SCOPES)[number];

export function isWatermarkMode(v: string): v is WatermarkMode {
  return (WATERMARK_MODES as readonly string[]).includes(v);
}

export function isWatermarkScope(v: string): v is WatermarkScope {
  return (WATERMARK_SCOPES as readonly string[]).includes(v);
}

export function clampWatermarkOpacity(value: number): number {
  if (!Number.isFinite(value)) return 8;
  return Math.min(25, Math.max(4, Math.round(value)));
}

export type WatermarkDisplay = {
  active: boolean;
  mode: WatermarkMode;
  label: string | null;
  opacity: number;
  hideRawLink: boolean;
};

export function resolveWatermarkDisplay(input: {
  mode: WatermarkMode;
  scope: WatermarkScope;
  text: string | null;
  orgName: string | null;
  includeViewer: boolean;
  opacity: number;
  visibility: "org" | "public";
  viewerEmail?: string | null;
  now?: Date;
}): WatermarkDisplay {
  const normalizedOpacity = clampWatermarkOpacity(input.opacity) / 100;
  if (input.mode === "off") {
    return { active: false, mode: "off", label: null, opacity: normalizedOpacity, hideRawLink: false };
  }
  if (input.scope === "org_only" && input.visibility === "public") {
    return { active: false, mode: input.mode, label: null, opacity: normalizedOpacity, hideRawLink: false };
  }

  const base = input.text?.trim() || (input.mode === "fullpage" ? input.orgName?.trim() || "Kiosk" : "");
  if (!base && !(input.includeViewer && input.viewerEmail)) {
    return { active: false, mode: input.mode, label: null, opacity: normalizedOpacity, hideRawLink: false };
  }

  const parts: string[] = [];
  if (base) parts.push(base);
  if (input.includeViewer && input.viewerEmail) {
    parts.push(input.viewerEmail.trim());
    parts.push((input.now ?? new Date()).toISOString().slice(0, 10));
  }

  return {
    active: true,
    mode: input.mode,
    label: parts.join(" · "),
    opacity: normalizedOpacity,
    hideRawLink: input.mode === "fullpage",
  };
}

function escapeXml(value: string): string {
  return value.replace(
    /[&<>"']/g,
    (ch) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&apos;" })[ch]!,
  );
}

export function buildWatermarkSvgDataUri(label: string, opacity: number): string {
  const safeOpacity = Math.min(0.35, Math.max(0.02, opacity));
  const safeText = escapeXml(label.slice(0, 120));
  const width = Math.max(280, Math.min(520, safeText.length * 10 + 120));
  const height = 180;
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">` +
    `<text x="50%" y="50%" dominant-baseline="middle" text-anchor="middle" ` +
    `fill="rgba(15,23,42,${safeOpacity})" font-family="system-ui,-apple-system,sans-serif" ` +
    `font-size="14" font-weight="600" transform="rotate(-28 ${width / 2} ${height / 2})">` +
    `${safeText}</text></svg>`;
  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}
