import { describe, it, expect } from "vitest";
import en from "../../messages/en.json";
import zh from "../../messages/zh.json";

function keys(obj: unknown, prefix = ""): string[] {
  if (obj && typeof obj === "object") {
    return Object.entries(obj).flatMap(([k, v]) =>
      keys(v, prefix ? `${prefix}.${k}` : k),
    );
  }
  return [prefix];
}

describe("i18n messages", () => {
  it("en and zh have identical key sets", () => {
    expect(keys(zh).sort()).toEqual(keys(en).sort());
  });

  it("defines every console namespace before page implementation", () => {
    const required = [
      "common",
      "nav",
      "shell",
      "pages",
      "members",
      "tokens",
      "branding",
      "history",
      "invite",
      "auth",
      "validation",
      "viewer",
      "storageAdmin",
    ];
    expect(Object.keys(en)).toEqual(expect.arrayContaining(required));
    expect(Object.keys(zh)).toEqual(expect.arrayContaining(required));
  });

  it("defines the platform storage console before rendering it", () => {
    for (const source of [en, zh]) {
      const m = source as unknown as Record<string, Record<string, string>>;
      expect(m.nav.storage).toBeTruthy();
      for (const key of [
        "title", "subtitle", "create", "provider", "destination", "usage",
        "health", "state", "test", "enable", "disable", "setDefault",
        "deleteConfirm", "saveFailed", "actionFailed",
      ]) {
        expect(m.storageAdmin[key], key).toBeTruthy();
      }
    }
  });

  it("defines split/new keys for pending invitations, member failures, and pages no-results", () => {
    for (const source of [en, zh]) {
      const m = source as unknown as Record<string, Record<string, string>>;
      expect(m.members.pendingInvitations).toBeTruthy();
      expect(m.members.pendingStatus).toBeTruthy();
      expect(m.members.inviteFailed).toBeTruthy();
      expect(m.members.updateRoleFailed).toBeTruthy();
      expect(m.members.removeFailed).toBeTruthy();
      expect(m.pages.noResultsTitle).toBeTruthy();
      expect(m.pages.noResults).toContain("{query}");
      expect(m.pages.clearSearch).toBeTruthy();
      expect("pending" in m.members).toBe(false);
    }
  });

  it("defines the settings namespace and nav.settings; drops retired keys", () => {
    for (const source of [en, zh]) {
      const m = source as unknown as Record<string, Record<string, string>>;
      for (const k of ["title", "subtitle", "general", "branding", "apiTokens", "generalDescription", "organizationName", "organizationId", "yourRole", "saved", "saveFailed", "nameRequired", "forbidden", "readOnly", "copyId"]) {
        expect(m.settings?.[k]).toBeTruthy();
      }
      expect(m.nav.settings).toBeTruthy();
      expect("tokens" in m.nav).toBe(false);
      expect("branding" in m.nav).toBe(false);
      expect("workspaceVisuals" in m.branding).toBe(false);
    }
  });

  it("defines save-feedback keys for branding and token creation", () => {
    for (const source of [en, zh]) {
      const m = source as unknown as Record<string, Record<string, string>>;
      expect(m.branding.saveFailed).toBeTruthy();
      expect(m.tokens.createFailed).toBeTruthy();
    }
  });

  it("defines dashboard error-boundary keys in both locales", () => {
    for (const source of [en, zh]) {
      const m = source as unknown as Record<string, Record<string, string>>;
      expect(m.common.retry).toBeTruthy();
      expect(m.shell.loadFailedTitle).toBeTruthy();
      expect(m.shell.loadFailedBody).toBeTruthy();
    }
  });

  it("defines page-action failure feedback keys in both locales", () => {
    for (const source of [en, zh]) {
      const m = source as unknown as Record<string, Record<string, string>>;
      for (const k of ["errorForbidden", "errorNotFound", "errorGeneric"]) {
        expect(m.pages[k], k).toBeTruthy();
      }
    }
  });

  it("defines P5-1 pages keys (filters, detail, pagination) in both locales", () => {
    for (const source of [en, zh]) {
      const m = source as unknown as Record<string, Record<string, string>>;
      for (const k of [
        "searchLabel", "searchButton", "filterVisibility", "filterOwner", "filterSort",
        "visibilityAll", "ownerAll", "ownerMe",
        "sortUpdatedDesc", "sortUpdatedAsc", "sortViewsDesc", "sortTitleAsc",
        "clearFilters", "noMatching",
        "detailSubtitle", "backToPages", "publicIdLabel", "shareUrl", "createdAt", "updatedAt", "sizeLabel", "totalViews", "versionCount",
        "recentVersions", "viewAllVersions",
        "paginationLabel", "paginationRange", "paginationPageOf", "previous", "next",
      ]) {
        expect(m.pages[k], k).toBeTruthy();
      }
      expect(m.pages.paginationRange).toContain("{from}");
      expect(m.pages.paginationRange).toContain("{total}");
    }
  });
});
