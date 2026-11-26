import { describe, expect, it } from "vitest";
import { evaluateUserSignupPolicy } from "./signup-policy";

describe("invite-only user signup policy", () => {
  it("allows any user when public signup is enabled", () => {
    expect(
      evaluateUserSignupPolicy({
        allowPublicSignup: true,
        existingUserCount: 5,
        hasValidInvitation: false,
      }),
    ).toEqual({ allowed: true });
  });

  it("allows the very first bootstrap user even when invite-only", () => {
    expect(
      evaluateUserSignupPolicy({
        allowPublicSignup: false,
        existingUserCount: 0,
        hasValidInvitation: false,
      }),
    ).toEqual({ allowed: true });
  });

  it("allows an invited user when invite-only", () => {
    expect(
      evaluateUserSignupPolicy({
        allowPublicSignup: false,
        existingUserCount: 3,
        hasValidInvitation: true,
      }),
    ).toEqual({ allowed: true });
  });

  it("blocks uninvited users when invite-only", () => {
    const decision = evaluateUserSignupPolicy({
      allowPublicSignup: false,
      existingUserCount: 3,
      hasValidInvitation: false,
    });
    expect(decision.allowed).toBe(false);
    expect(decision.reason).toContain("invite-only");
  });
});
