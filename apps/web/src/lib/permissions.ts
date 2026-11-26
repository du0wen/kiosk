export type Role = "owner" | "admin" | "member";

export type Action =
  | "page.edit"
  | "page.delete"
  | "page.setVisibility"
  | "member.invite"
  | "member.remove"
  | "member.setRole"
  | "org.update"
  | "org.delete"
  | "org.transfer";

/**
 * Authorization decision for an org-internal action. Pure — no I/O.
 * `ctx.isResourceOwner` = caller created the page (for a member's own-page rights).
 */
export function can(
  role: Role,
  action: Action,
  ctx?: { isResourceOwner?: boolean },
): boolean {
  switch (action) {
    case "page.edit":
      return true; // any member edits any org page (shared workspace)
    case "page.delete":
    case "page.setVisibility":
      return (
        role === "owner" || role === "admin" || ctx?.isResourceOwner === true
      );
    case "member.invite":
    case "member.remove":
    case "member.setRole":
    case "org.update":
      return role === "owner" || role === "admin";
    case "org.delete":
    case "org.transfer":
      return role === "owner";
    default:
      return false;
  }
}
