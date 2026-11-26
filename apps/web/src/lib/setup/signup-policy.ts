export type SignupPolicyInput = {
  allowPublicSignup: boolean;
  existingUserCount: number;
  hasValidInvitation: boolean;
};

export type SignupPolicyDecision =
  | { allowed: true }
  | { allowed: false; reason: string };

export function evaluateUserSignupPolicy(
  input: SignupPolicyInput,
): SignupPolicyDecision {
  if (input.allowPublicSignup) return { allowed: true };
  if (input.existingUserCount === 0) return { allowed: true };
  if (input.hasValidInvitation) return { allowed: true };
  return {
    allowed: false,
    reason:
      "Registration is invite-only. Please ask an administrator for an invitation link.",
  };
}
