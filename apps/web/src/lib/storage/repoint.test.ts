import { describe, expect, it } from "vitest";
import { parseRepointArgs } from "./repoint";

const source = "018f4f2a-6d80-7000-8000-000000000001";
const target = "018f4f2a-6d80-7000-8000-000000000002";

describe("storage repoint arguments", () => {
  it("requires distinct source and target profiles", () => {
    expect(parseRepointArgs(["repoint", "--source", source, "--target", target])).toMatchObject({
      sourceProfileId: source,
      targetProfileId: target,
      batchSize: 100,
    });
    expect(() => parseRepointArgs(["repoint", "--source", source, "--target", source])).toThrow("different");
    expect(() => parseRepointArgs(["repoint", "--source", source])).toThrow("--target");
  });
});
