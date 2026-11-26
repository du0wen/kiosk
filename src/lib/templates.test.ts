import { describe, expect, it } from "vitest";
import {
  applyTemplateShell,
  isTemplateCategory,
  normalizeTemplateSlug,
  STARTER_TEMPLATES,
} from "./templates";

describe("org templates helpers", () => {
  it("normalizes valid slugs and rejects empty or invalid ones", () => {
    expect(normalizeTemplateSlug("  Exec Report 2026! ")).toBe("exec-report-2026");
    expect(normalizeTemplateSlug("tech_spec")).toBe("tech-spec");
    expect(() => normalizeTemplateSlug("   ")).toThrow();
    expect(() => normalizeTemplateSlug("---")).toThrow();
  });

  it("validates template categories", () => {
    expect(isTemplateCategory("report")).toBe(true);
    expect(isTemplateCategory("proposal")).toBe(true);
    expect(isTemplateCategory("dashboard")).toBe(true);
    expect(isTemplateCategory("unknown")).toBe(false);
  });

  it("applies TITLE and CONTENT placeholders cleanly", () => {
    const wrapped = applyTemplateShell(
      "<html><head><title>{{TITLE}}</title></head><body>{{CONTENT}}</body></html>",
      "<p>Hello</p>",
      "Q4 Review",
    );
    expect(wrapped).toContain("<title>Q4 Review</title>");
    expect(wrapped).toContain("<body><p>Hello</p></body>");
  });

  it("provides self-contained starter templates with placeholders", () => {
    expect(STARTER_TEMPLATES.length).toBeGreaterThanOrEqual(3);
    for (const tpl of STARTER_TEMPLATES) {
      expect(tpl.html).toContain("{{TITLE}}");
      expect(tpl.html).toContain("{{CONTENT}}");
      expect(isTemplateCategory(tpl.category)).toBe(true);
    }
  });
});
