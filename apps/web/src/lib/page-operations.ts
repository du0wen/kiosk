import { eq } from "drizzle-orm";
import { db } from "@/db";
import { organization, user, type Page } from "@/db/schema";
import {
  createPage,
  getPage,
  listPages,
  pageRawUrl,
  pageShellUrl,
  PageTooLargeError,
  setPageVisibility,
  softDeletePage,
  updatePage,
} from "@/lib/pages";
import { can, type Role } from "@/lib/permissions";
import { getOrgSettings } from "@/lib/org-settings";
import { recordOrgAuditEvent } from "@/lib/audit";
import { ContentRepositoryError } from "@/lib/storage/content-repository";

export type Caller = {
  userId: string;
  organizationId: string;
  role: Role;
};

export type PageVisibility = "org" | "public";

export type PageMetadata = {
  id: string;
  url: string;
  rawUrl: string;
  title: string | null;
  visibility: PageVisibility;
  sizeBytes: number;
  viewCount: number;
  createdAt: Date;
  updatedAt: Date;
};

export type OperationErrorCode =
  | "bad_request"
  | "forbidden"
  | "not_found"
  | "too_large"
  | "storage_unavailable";

export class OperationError extends Error {
  constructor(
    public code: OperationErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "OperationError";
  }
}

function metadata(page: Page): PageMetadata {
  return {
    id: page.publicId,
    url: pageShellUrl(page.publicId),
    rawUrl: pageRawUrl(page.publicId),
    title: page.title,
    visibility: page.visibility as PageVisibility,
    sizeBytes: page.sizeBytes,
    viewCount: page.viewCount,
    createdAt: page.createdAt,
    updatedAt: page.updatedAt,
  };
}

function requireHtml(html: string): void {
  if (!html.trim()) {
    throw new OperationError("bad_request", "Empty body");
  }
}

async function mapPageSizeError<T>(operation: () => Promise<T>): Promise<T> {
  try {
    return await operation();
  } catch (error) {
    if (error instanceof PageTooLargeError) {
      throw new OperationError("too_large", error.message);
    }
    if (error instanceof ContentRepositoryError && error.code === "storage_unavailable") {
      throw new OperationError("storage_unavailable", "Content storage is unavailable");
    }
    throw error;
  }
}

async function assertPublicSharingAllowed(
  organizationId: string,
  visibility?: PageVisibility,
): Promise<void> {
  if (visibility !== "public") return;
  const settings = await getOrgSettings(organizationId);
  if (!settings.allowPublicPages) {
    throw new OperationError(
      "forbidden",
      "Public page sharing is disabled by organization policy",
    );
  }
}

export async function createPageForCaller(
  caller: Caller,
  input: { html: string; title?: string | null; visibility?: PageVisibility },
): Promise<PageMetadata> {
  requireHtml(input.html);
  await assertPublicSharingAllowed(caller.organizationId, input.visibility);
  const page = await mapPageSizeError(() =>
    createPage({
      organizationId: caller.organizationId,
      userId: caller.userId,
      html: input.html,
      title: input.title,
      visibility: input.visibility,
    }),
  );
  void recordOrgAuditEvent({
    organizationId: caller.organizationId,
    actorUserId: caller.userId,
    action: "page.publish",
    targetType: "page",
    targetId: page.publicId,
    summary: `${page.title ?? page.publicId} (${page.visibility})`,
  });
  return metadata(page);
}

export async function updatePageForCaller(
  caller: Caller,
  input: {
    pageId: string;
    html: string;
    title?: string | null;
    visibility?: PageVisibility;
  },
): Promise<PageMetadata> {
  requireHtml(input.html);
  await assertPublicSharingAllowed(caller.organizationId, input.visibility);
  const page = await mapPageSizeError(() =>
    updatePage({
      publicId: input.pageId,
      organizationId: caller.organizationId,
      userId: caller.userId,
      html: input.html,
      title: input.title,
      visibility: input.visibility,
    }),
  );
  if (!page) throw new OperationError("not_found", "Page not found");
  void recordOrgAuditEvent({
    organizationId: caller.organizationId,
    actorUserId: caller.userId,
    action: "page.update",
    targetType: "page",
    targetId: page.publicId,
    summary: page.title ?? page.publicId,
  });
  return metadata(page);
}

export async function listPagesForCaller(
  caller: Caller,
  input: { cursor?: string | null; limit?: number } = {},
): Promise<{ items: PageMetadata[]; nextCursor: string | null }> {
  if (
    input.limit !== undefined &&
    (!Number.isInteger(input.limit) || input.limit < 1 || input.limit > 100)
  ) {
    throw new OperationError("bad_request", "limit must be an integer from 1 to 100");
  }
  if (input.cursor && Number.isNaN(Date.parse(input.cursor))) {
    throw new OperationError("bad_request", "Invalid cursor");
  }
  const result = await listPages({
    organizationId: caller.organizationId,
    cursor: input.cursor,
    limit: input.limit,
  });
  return { items: result.items.map(metadata), nextCursor: result.nextCursor };
}

export async function getPageForCaller(
  caller: Caller,
  pageId: string,
): Promise<PageMetadata> {
  const page = await getPage({
    publicId: pageId,
    organizationId: caller.organizationId,
  });
  if (!page) throw new OperationError("not_found", "Page not found");
  return metadata(page);
}

export async function setPageVisibilityForCaller(
  caller: Caller,
  input: { pageId: string; visibility: PageVisibility },
): Promise<PageMetadata> {
  await assertPublicSharingAllowed(caller.organizationId, input.visibility);
  const page = await getPage({
    publicId: input.pageId,
    organizationId: caller.organizationId,
  });
  if (!page) throw new OperationError("not_found", "Page not found");
  if (
    !can(caller.role, "page.setVisibility", {
      isResourceOwner: page.createdBy === caller.userId,
    })
  ) {
    throw new OperationError("forbidden", "Not allowed to change this page");
  }
  const updated = await setPageVisibility({
    publicId: input.pageId,
    organizationId: caller.organizationId,
    userId: caller.userId,
    visibility: input.visibility,
  });
  if (!updated) throw new OperationError("not_found", "Page not found");
  return metadata(updated);
}

export async function deletePageForCaller(
  caller: Caller,
  pageId: string,
): Promise<{ id: string; deleted: true }> {
  const page = await getPage({ publicId: pageId, organizationId: caller.organizationId });
  if (!page) throw new OperationError("not_found", "Page not found");
  if (
    !can(caller.role, "page.delete", {
      isResourceOwner: page.createdBy === caller.userId,
    })
  ) {
    throw new OperationError("forbidden", "Not allowed to delete this page");
  }
  const deleted = await softDeletePage({
    publicId: pageId,
    organizationId: caller.organizationId,
    userId: caller.userId,
  });
  if (!deleted) throw new OperationError("not_found", "Page not found");
  return { id: pageId, deleted: true };
}

export async function getCallerProfile(caller: Caller): Promise<{
  user: { id: string; name: string; email: string } | null;
  organization: { id: string; name: string; slug: string } | null;
  role: Role;
}> {
  const [callerUser] = await db
    .select({ id: user.id, name: user.name, email: user.email })
    .from(user)
    .where(eq(user.id, caller.userId))
    .limit(1);
  const [callerOrganization] = await db
    .select({ id: organization.id, name: organization.name, slug: organization.slug })
    .from(organization)
    .where(eq(organization.id, caller.organizationId))
    .limit(1);
  return {
    user: callerUser ?? null,
    organization: callerOrganization ?? null,
    role: caller.role,
  };
}

export type KioskOperations = {
  createPage: typeof createPageForCaller;
  updatePage: typeof updatePageForCaller;
  listPages: typeof listPagesForCaller;
  getPage: typeof getPageForCaller;
  setPageVisibility: typeof setPageVisibilityForCaller;
  deletePage: typeof deletePageForCaller;
  getCallerProfile: typeof getCallerProfile;
};

export const kioskOperations: KioskOperations = {
  createPage: createPageForCaller,
  updatePage: updatePageForCaller,
  listPages: listPagesForCaller,
  getPage: getPageForCaller,
  setPageVisibility: setPageVisibilityForCaller,
  deletePage: deletePageForCaller,
  getCallerProfile,
};
