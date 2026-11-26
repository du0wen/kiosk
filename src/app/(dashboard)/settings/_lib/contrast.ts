/**
 * Minimal WCAG contrast helpers so the branding form can warn when a chosen
 * accent color would be hard to read on the branded shell's white surfaces.
 */
export function parseHex(hex: string): [number, number, number] {
  const raw = hex.replace("#", "").trim();
  const full =
    raw.length === 3
      ? raw
          .split("")
          .map((char) => char + char)
          .join("")
      : raw;
  return [0, 2, 4].map((i) => parseInt(full.slice(i, i + 2), 16)) as [number, number, number];
}

function relativeLuminance(hex: string): number {
  const [r, g, b] = parseHex(hex).map((value) => {
    const channel = value / 255;
    return channel <= 0.03928 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function contrastRatio(a: string, b: string): number {
  const la = relativeLuminance(a);
  const lb = relativeLuminance(b);
  const lighter = Math.max(la, lb);
  const darker = Math.min(la, lb);
  return (lighter + 0.05) / (darker + 0.05);
}

/**
 * The accent is used for brand text and primary buttons on white surfaces.
 * WCAG AA for UI components / large text is 3:1, so warn below that.
 */
export function isReadableAccent(accent: string, background = "#ffffff"): boolean {
  try {
    return contrastRatio(accent, background) >= 3;
  } catch {
    return true; // don't block on an unparseable value; hex validation handles that
  }
}
