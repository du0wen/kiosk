import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Mock-based unit tests for the reliability edges the DB integration test
// (page-actions.test.ts) can't force: a write that matches no row (page removed
// mid-flight), an illegal visibility value, and a thrown DB error. The pages
// module is mocked here so those results can be simulated deterministically.
const m = vi.hoisted(() => ({
  session: null as { user: { id: string } } | null,
  org: null as string | null,
  role: null as string | null,
  getPage: vi.fn(),
  setPageVisibility: vi.fn(),
  softDeletePage: vi.fn(),
  renameTitle: vi.fn(),
  revalidatePath: vi.fn(),
  emitOperationalEvent: vi.fn(),
}));

vi.mock("@/lib/session", () => ({ getSession: async () => m.session }));
vi.mock("@/lib/console", () => ({ resolveActiveOrg: async () => m.org, roleInOrg: async () => m.role }));
vi.mock("@/lib/pages", () => ({ getPage: m.getPage, setPageVisibility: m.setPageVisibility, softDeletePage: m.softDeletePage, renameTitle: m.renameTitle }));
vi.mock("next/cache", () => ({ revalidatePath: m.revalidatePath }));
vi.mock("@/lib/operations/runtime", () => ({
  emitOperationalEvent: m.emitOperationalEvent,
}));

import { deletePageAction, renamePageAction, setPageVisibilityAction } from "./page-actions";

const fd = (o: Record<string, string>) => { const f = new FormData(); Object.entries(o).forEach(([k, v]) => f.set(k, v)); return f; };

beforeEach(() => {
  m.session = { user: { id: "u1" } };
  m.org = "org1";
  m.role = "owner"; // real can(): owner passes every capability gate
  m.getPage.mockReset().mockResolvedValue({ createdBy: "u1" });
  m.setPageVisibility.mockReset().mockResolvedValue({ id: "p1" });
  m.softDeletePage.mockReset().mockResolvedValue(true);
  m.renameTitle.mockReset().mockResolvedValue(true);
  m.revalidatePath.mockReset();
  m.emitOperationalEvent.mockReset().mockResolvedValue(undefined);
  vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => vi.restoreAllMocks());

describe("setPageVisibilityAction — strict visibility validation", () => {
  it("rejects a non-whitelisted value without reading or writing the page", async () => {
    expect(await setPageVisibilityAction(fd({ id: "p1", to: "hacked" }))).toEqual({ ok: false, error: "invalid_input" });
    expect(m.getPage).not.toHaveBeenCalled();
    expect(m.setPageVisibility).not.toHaveBeenCalled();
  });
  it("treats a missing visibility value as invalid_input", async () => {
    expect(await setPageVisibilityAction(fd({ id: "p1" }))).toEqual({ ok: false, error: "invalid_input" });
    expect(m.setPageVisibility).not.toHaveBeenCalled();
  });
  it("passes the exact whitelisted value through (no implicit downgrade)", async () => {
    await setPageVisibilityAction(fd({ id: "p1", to: "public" }));
    expect(m.setPageVisibility).toHaveBeenCalledWith(expect.objectContaining({ visibility: "public" }));
    m.setPageVisibility.mockClear();
    await setPageVisibilityAction(fd({ id: "p1", to: "org" }));
    expect(m.setPageVisibility).toHaveBeenCalledWith(expect.objectContaining({ visibility: "org" }));
  });
});

describe("actions — final write result is authoritative", () => {
  it("visibility write matching no row → not_found, no revalidate", async () => {
    m.setPageVisibility.mockResolvedValue(null);
    expect(await setPageVisibilityAction(fd({ id: "p1", to: "public" }))).toEqual({ ok: false, error: "not_found" });
    expect(m.revalidatePath).not.toHaveBeenCalled();
  });
  it("delete write matching no row → not_found, no revalidate", async () => {
    m.softDeletePage.mockResolvedValue(false);
    expect(await deletePageAction(fd({ id: "p1" }))).toEqual({ ok: false, error: "not_found" });
    expect(m.revalidatePath).not.toHaveBeenCalled();
  });
  it("rename write matching no row → not_found, no revalidate", async () => {
    m.renameTitle.mockResolvedValue(false);
    expect(await renamePageAction(fd({ id: "p1", title: "New" }))).toEqual({ ok: false, error: "not_found" });
    expect(m.revalidatePath).not.toHaveBeenCalled();
  });
  it("returns ok and revalidates only after a successful delete write", async () => {
    expect(await deletePageAction(fd({ id: "p1" }))).toEqual({ ok: true });
    expect(m.revalidatePath).toHaveBeenCalled();
  });
  it("returns ok and revalidates only after a successful visibility write", async () => {
    expect(await setPageVisibilityAction(fd({ id: "p1", to: "org" }))).toEqual({ ok: true });
    expect(m.revalidatePath).toHaveBeenCalled();
  });
});

describe("actions — DB exceptions become internal_error", () => {
  it("read throws → internal_error, no revalidate (delete + visibility)", async () => {
    m.getPage.mockRejectedValue(new Error("db down"));
    expect(await deletePageAction(fd({ id: "p1" }))).toEqual({ ok: false, error: "internal_error" });
    expect(await setPageVisibilityAction(fd({ id: "p1", to: "public" }))).toEqual({ ok: false, error: "internal_error" });
    expect(m.revalidatePath).not.toHaveBeenCalled();
  });
  it("delete write throws → internal_error, no revalidate", async () => {
    m.softDeletePage.mockRejectedValue(new Error("db down"));
    expect(await deletePageAction(fd({ id: "p1" }))).toEqual({ ok: false, error: "internal_error" });
    expect(m.revalidatePath).not.toHaveBeenCalled();
  });
  it("visibility write throws → internal_error", async () => {
    m.setPageVisibility.mockRejectedValue(new Error("db down"));
    expect(await setPageVisibilityAction(fd({ id: "p1", to: "public" }))).toEqual({ ok: false, error: "internal_error" });
  });
  it("rename write throws → internal_error", async () => {
    m.renameTitle.mockRejectedValue(new Error("db down"));
    expect(await renamePageAction(fd({ id: "p1", title: "New" }))).toEqual({ ok: false, error: "internal_error" });
    expect(m.emitOperationalEvent).toHaveBeenCalledWith({
      name: "unexpected.error",
      routeCategory: "console",
      errorCode: "internal",
    });
  });
  it("does not leak the underlying error to the caller", async () => {
    m.getPage.mockRejectedValue(new Error("connect ECONNREFUSED 35.x.x.x:5432"));
    const r = await deletePageAction(fd({ id: "p1" }));
    expect(r).toEqual({ ok: false, error: "internal_error" });
    expect(JSON.stringify(r)).not.toMatch(/ECONNREFUSED|5432/);
  });
});
