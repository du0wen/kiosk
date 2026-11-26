import { describe, expect, it } from "vitest";
import { memberInitials } from "./member-label";

describe("memberInitials", () => {
  it("uses first and last name initials", () => expect(memberInitials("Ada Lovelace", "ada@example.com")).toBe("AL"));
  it("falls back to the email handle", () => expect(memberInitials(null, "kevin@example.com")).toBe("KE"));
});
