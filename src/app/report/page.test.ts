import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

describe("report submission protection", () => {
  it("limits by request and page without logging submitted content", async () => {
    const source = await readFile(new URL("./page.tsx", import.meta.url), "utf8");
    expect(source).toContain("enforceRequestLimit");
    expect(source).toContain('"report"');
    expect(source).toContain("submitAbuseReport");
    expect(source).not.toContain("console.warn");
    expect(source).not.toContain("ABUSE REPORT");
  });
});
