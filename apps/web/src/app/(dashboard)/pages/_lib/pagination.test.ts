import { describe, expect, it } from "vitest";
import { pageWindow, emptyState } from "./pagination";

describe("pageWindow", () => {
  it("computes the range and total pages", () => {
    expect(pageWindow(83, 1, 25)).toEqual({ from: 1, to: 25, pages: 4, clampedPage: 1 });
    expect(pageWindow(83, 4, 25)).toEqual({ from: 76, to: 83, pages: 4, clampedPage: 4 });
  });
  it("clamps an over-bounds page to the last valid page", () => {
    expect(pageWindow(83, 9, 25).clampedPage).toBe(4);
  });
  it("handles zero results", () => {
    expect(pageWindow(0, 1, 25)).toEqual({ from: 0, to: 0, pages: 0, clampedPage: 1 });
  });
});

describe("emptyState", () => {
  it("returns 'first' when the org has no pages", () => {
    expect(emptyState(0, 0)).toBe("first");
  });
  it("returns 'no-match' when filters exclude everything", () => {
    expect(emptyState(5, 0)).toBe("no-match");
  });
  it("returns null when there are results", () => {
    expect(emptyState(5, 3)).toBeNull();
  });
});
