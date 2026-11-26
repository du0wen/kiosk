import { describe, expect, it } from "vitest";
import { buildWatermarkSvgDataUri, resolveWatermarkDisplay } from "./watermark";

describe("watermark policy resolver", () => {
  it("disables watermark when mode is off or scope excludes public pages", () => {
    expect(
      resolveWatermarkDisplay({
        mode: "off",
        scope: "all",
        text: "Confidential",
        orgName: "Acme",
        includeViewer: true,
        opacity: 10,
        visibility: "org",
        viewerEmail: "alice@acme.com",
      }).active,
    ).toBe(false);

    expect(
      resolveWatermarkDisplay({
        mode: "fullpage",
        scope: "org_only",
        text: "Confidential",
        orgName: "Acme",
        includeViewer: true,
        opacity: 10,
        visibility: "public",
        viewerEmail: null,
      }).active,
    ).toBe(false);
  });

  it("appends viewer email and ISO date when includeViewer is enabled", () => {
    const res = resolveWatermarkDisplay({
      mode: "fullpage",
      scope: "org_only",
      text: "Internal Only",
      orgName: "Acme",
      includeViewer: true,
      opacity: 12,
      visibility: "org",
      viewerEmail: "alice@acme.com",
      now: new Date("2026-11-25T10:00:00Z"),
    });
    expect(res).toEqual({
      active: true,
      mode: "fullpage",
      label: "Internal Only · alice@acme.com · 2026-11-25",
      opacity: 0.12,
      hideRawLink: true,
    });
  });

  it("falls back to org name when custom watermark text is empty in fullpage mode", () => {
    const res = resolveWatermarkDisplay({
      mode: "fullpage",
      scope: "all",
      text: null,
      orgName: "Acme Corp",
      includeViewer: false,
      opacity: 8,
      visibility: "public",
      viewerEmail: null,
    });
    expect(res.active).toBe(true);
    expect(res.label).toBe("Acme Corp");
    expect(res.hideRawLink).toBe(true);
  });

  it("generates an escaped SVG data URI for diagonal tiling", () => {
    const uri = buildWatermarkSvgDataUri("Acme <Confidential> & Co", 0.1);
    expect(uri.startsWith("data:image/svg+xml,")).toBe(true);
    expect(decodeURIComponent(uri)).toContain("Acme &lt;Confidential&gt; &amp; Co");
    expect(decodeURIComponent(uri)).toContain("rotate(-28");
  });
});
