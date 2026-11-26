"use server";

import { revalidatePath } from "next/cache";
import { getSession } from "@/lib/session";
import { resolveActiveOrg, roleInOrg } from "@/lib/console";
import { can } from "@/lib/permissions";
import { getPage, renameTitle, setPageVisibility, softDeletePage } from "@/lib/pages";
import { emitOperationalEvent } from "@/lib/operations/runtime";

/**
 * Result of a shared page mutation. The client only closes a dialog / refreshes
 * / navigates on `{ ok: true }`; on failure it surfaces the error code via the
 * shared Notice — hidden buttons are never trusted as authorization. `ok` is
 * only reported once the DB write is confirmed to have touched a row, so a page
 * removed mid-flight can't produce a false success. `internal_error` is the
 * generic bucket for a thrown DB error (details stay server-side).
 */
export type ActionResult =
  | { ok: true }
  | { ok: false; error: "unauthenticated" | "forbidden" | "not_found" | "invalid_input" | "internal_error" };

/**
 * Shared, server-authoritative page mutations used by both the list and detail
 * views — the single home for their auth + write logic. Each re-derives
 * session → active org → role from the request; the org scope comes from the
 * session, so a page id can only ever hit the caller's active org. Navigation
 * (e.g. redirect after delete) stays a UI concern.
 */
async function actor() {
  const session = await getSession();
  if (!session) return null;
  const org = await resolveActiveOrg(session);
  if (!org) return null;
  const role = await roleInOrg(session.user.id, org);
  if (!role) return null;
  return { userId: session.user.id, org, role };
}

function revalidate(publicId: string) {
  revalidatePath("/pages");
  revalidatePath(`/pages/${publicId}`);
}

async function reportInternalError(): Promise<void> {
  await emitOperationalEvent({
    name: "unexpected.error",
    routeCategory: "console",
    errorCode: "internal",
  });
}

/** Any organization member may rename any page. */
export async function renamePageAction(formData: FormData): Promise<ActionResult> {
  try {
    const a = await actor();
    if (!a) return { ok: false, error: "unauthenticated" };
    const publicId = String(formData.get("id") ?? "");
    const title = String(formData.get("title") ?? "").trim();
    if (!publicId || !title) return { ok: false, error: "invalid_input" };
    const renamed = await renameTitle(publicId, a.org, title);
    if (!renamed) return { ok: false, error: "not_found" };
    revalidate(publicId);
    return { ok: true };
  } catch {
    await reportInternalError();
    return { ok: false, error: "internal_error" };
  }
}

/** owner/admin: any page; member: own page only. */
export async function setPageVisibilityAction(formData: FormData): Promise<ActionResult> {
  try {
    const a = await actor();
    if (!a) return { ok: false, error: "unauthenticated" };
    const publicId = String(formData.get("id") ?? "");
    if (!publicId) return { ok: false, error: "invalid_input" };
    // Whitelist the target; never implicitly downgrade an illegal value, and
    // don't touch page data until the input is known-good.
    const to = String(formData.get("to") ?? "");
    if (to !== "public" && to !== "org") return { ok: false, error: "invalid_input" };
    const page = await getPage({ publicId, organizationId: a.org });
    if (!page) return { ok: false, error: "not_found" };
    if (!can(a.role, "page.setVisibility", { isResourceOwner: page.createdBy === a.userId })) {
      return { ok: false, error: "forbidden" };
    }
    const updated = await setPageVisibility({ publicId, organizationId: a.org, userId: a.userId, visibility: to });
    if (!updated) return { ok: false, error: "not_found" };
    revalidate(publicId);
    return { ok: true };
  } catch {
    await reportInternalError();
    return { ok: false, error: "internal_error" };
  }
}

/** owner/admin: any page; member: own page only. */
export async function deletePageAction(formData: FormData): Promise<ActionResult> {
  try {
    const a = await actor();
    if (!a) return { ok: false, error: "unauthenticated" };
    const publicId = String(formData.get("id") ?? "");
    if (!publicId) return { ok: false, error: "invalid_input" };
    const page = await getPage({ publicId, organizationId: a.org });
    if (!page) return { ok: false, error: "not_found" };
    if (!can(a.role, "page.delete", { isResourceOwner: page.createdBy === a.userId })) {
      return { ok: false, error: "forbidden" };
    }
    const deleted = await softDeletePage({ publicId, organizationId: a.org, userId: a.userId });
    if (!deleted) return { ok: false, error: "not_found" };
    revalidate(publicId);
    return { ok: true };
  } catch {
    await reportInternalError();
    return { ok: false, error: "internal_error" };
  }
}
