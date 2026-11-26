import { describe, expect, it } from "vitest";
import { contrastRatio, isReadableAccent, parseHex } from "./contrast";

describe("parseHex", () => {
  it("parses 6- and 3-digit hex", () => {
    expect(parseHex("#ffffff")).toEqual([255, 255, 255]);
    expect(parseHex("#000")).toEqual([0, 0, 0]);
    expect(parseHex("0f766e")).toEqual([15, 118, 110]);
  });
});

describe("contrastRatio", () => {
  it("is ~21 for black on white and 1 for identical colors", () => {
    expect(contrastRatio("#000000", "#ffffff")).toBeCloseTo(21, 0);
    expect(contrastRatio("#ffffff", "#ffffff")).toBeCloseTo(1, 5);
  });
});

describe("isReadableAccent", () => {
  it("accepts the default teal on white", () => {
    expect(isReadableAccent("#0f766e")).toBe(true);
  });

  it("rejects light accents that would be unreadable on white", () => {
    expect(isReadableAccent("#ffff00")).toBe(false); // yellow
    expect(isReadableAccent("#e5e7eb")).toBe(false); // light gray
  });
});
