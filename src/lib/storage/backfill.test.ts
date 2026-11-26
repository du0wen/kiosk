import { describe, expect, it } from "vitest";
import { formatBackfillCursor, parseBackfillCursor } from "./backfill";

describe("backfill cursor", () => {
  it("round trips page and version checkpoints", () => {
    expect(parseBackfillCursor(formatBackfillCursor("page", "018f4f2a-6d80-7000-8000-000000000001"))).toEqual({
      sourceType: "page",
      sourceId: "018f4f2a-6d80-7000-8000-000000000001",
    });
    expect(parseBackfillCursor(formatBackfillCursor("version", "018f4f2a-6d80-7000-8000-000000000002"))).toEqual({
      sourceType: "version",
      sourceId: "018f4f2a-6d80-7000-8000-000000000002",
    });
  });

  it("rejects malformed and non-UUID resume tokens", () => {
    expect(() => parseBackfillCursor("content:value")).toThrow("cursor");
    expect(() => parseBackfillCursor("page:not-a-uuid")).toThrow("cursor");
  });
});
