import { describe, expect, it } from "vitest";
import { createRequestId } from "./request-id";

describe("createRequestId", () => {
  it("uses an injected UUID source and returns an allowlisted identifier", () => {
    expect(createRequestId(() => "01234567-89ab-4def-8123-456789abcdef")).toBe(
      "01234567-89ab-4def-8123-456789abcdef",
    );
  });

  it("rejects an invalid generator result", () => {
    expect(() => createRequestId(() => "Bearer secret value")).toThrow();
  });
});
