import { describe, it, expect } from "vitest";
import { signServeToken, verifyServeToken } from "./serve-token";

describe("serve-token", () => {
  it("round-trips org + user", () => {
    const t = signServeToken("org_1", "user_1");
    expect(verifyServeToken(t)).toEqual({ orgId: "org_1", userId: "user_1" });
  });
  it("rejects a tampered signature", () => {
    const t = signServeToken("org_1", "user_1");
    expect(verifyServeToken(t.slice(0, -2) + "xy")).toBeNull();
  });
  it("rejects an expired token", () => {
    const t = signServeToken("org_1", "user_1", -1000); // already expired
    expect(verifyServeToken(t)).toBeNull();
  });
  it("rejects garbage", () => {
    expect(verifyServeToken("nonsense")).toBeNull();
    expect(verifyServeToken("")).toBeNull();
  });
});
