import { describe, expect, it } from "vitest";
import { classifyOrphans, parseOrphanCleanupArgs } from "./orphan-cleanup";

describe("orphan cleanup", () => {
  it("reports only old objects absent from database reachability", () => {
    const now = new Date("2026-09-10T00:00:00Z");
    const result = classifyOrphans([
      { key: "organizations/a/old", sizeBytes: 10, modifiedAt: new Date("2026-09-01T00:00:00Z") },
      { key: "organizations/a/referenced", sizeBytes: 20, modifiedAt: new Date("2026-09-01T00:00:00Z") },
      { key: "organizations/a/recent", sizeBytes: 30, modifiedAt: new Date("2026-09-09T12:00:00Z") },
      { key: "organizations/a/unknown", sizeBytes: 40, modifiedAt: null },
    ], new Set(["organizations/a/referenced"]), 24, now);
    expect(result.map((object) => object.key)).toEqual(["organizations/a/old"]);
  });

  it("requires a safe age and exact deletion confirmation", () => {
    expect(parseOrphanCleanupArgs(["orphan-report", "--profile", "018f4f2a-6d80-7000-8000-000000000001"])).toMatchObject({
      command: "orphan-report",
      safetyAgeHours: 168,
      deleteObjects: false,
    });
    expect(() => parseOrphanCleanupArgs(["orphan-delete", "--profile", "018f4f2a-6d80-7000-8000-000000000001"])).toThrow("DELETE_ORPHAN_OBJECTS");
    expect(() => parseOrphanCleanupArgs(["orphan-delete", "--profile", "018f4f2a-6d80-7000-8000-000000000001", "--safety-hours", "1", "--confirm", "DELETE_ORPHAN_OBJECTS"])).toThrow("24");
    expect(parseOrphanCleanupArgs(["orphan-delete", "--profile", "018f4f2a-6d80-7000-8000-000000000001", "--confirm", "DELETE_ORPHAN_OBJECTS"])).toMatchObject({
      deleteObjects: true,
      confirmed: true,
    });
  });
});
