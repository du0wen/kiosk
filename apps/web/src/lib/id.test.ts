import { describe, it, expect } from "vitest";
import { uuidv7, publicId } from "./id";

describe("uuidv7", () => {
  it("returns a version-7 UUID", () => {
    const id = uuidv7();
    expect(id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
    );
  });
  it("is time-ordered (later id sorts after earlier)", () => {
    const a = uuidv7();
    const b = uuidv7();
    expect(b >= a).toBe(true);
  });
});

describe("publicId", () => {
  it("is 12 base62 chars", () => {
    expect(publicId()).toMatch(/^[0-9A-Za-z]{12}$/);
  });
  it("is unique across 10k draws", () => {
    const seen = new Set(Array.from({ length: 10_000 }, () => publicId()));
    expect(seen.size).toBe(10_000);
  });
});
