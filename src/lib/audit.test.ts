import { describe, expect, it } from "vitest";
import { AUDIT_ACTIONS } from "./audit";

describe("org audit log contract", () => {
  it("covers all critical organization governance actions", () => {
    expect(AUDIT_ACTIONS).toContain("page.visibility");
    expect(AUDIT_ACTIONS).toContain("template.restore");
    expect(AUDIT_ACTIONS).toContain("org.security");
    expect(AUDIT_ACTIONS).toContain("org.transfer");
  });
});
