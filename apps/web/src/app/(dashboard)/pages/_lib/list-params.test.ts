import { describe, expect, it } from "vitest";
import { canonicalizeOwner, parsePageListParams, pagesHref, PAGE_SIZE } from "./list-params";

describe("parsePageListParams", () => {
  it("returns defaults for empty input", () => {
    expect(parsePageListParams({})).toEqual({ q: "", visibility: "all", owner: "all", sort: "updated_desc", page: 1 });
  });
  it("whitelists visibility and falls back", () => {
    expect(parsePageListParams({ visibility: "public" }).visibility).toBe("public");
    expect(parsePageListParams({ visibility: "org" }).visibility).toBe("org");
    expect(parsePageListParams({ visibility: "secret" }).visibility).toBe("all");
  });
  it("whitelists sort and falls back", () => {
    for (const s of ["updated_desc", "updated_asc", "views_desc", "title_asc"]) {
      expect(parsePageListParams({ sort: s }).sort).toBe(s);
    }
    expect(parsePageListParams({ sort: "hacked; drop table" }).sort).toBe("updated_desc");
  });
  it("parses owner me / userId / junk", () => {
    expect(parsePageListParams({ owner: "me" }).owner).toBe("me");
    expect(parsePageListParams({ owner: "019f64c7-4438-779b" }).owner).toBe("019f64c7-4438-779b");
    expect(parsePageListParams({ owner: "all" }).owner).toBe("all");
    expect(parsePageListParams({ owner: "" }).owner).toBe("all");
    expect(parsePageListParams({ owner: "a b" }).owner).toBe("all");
    expect(parsePageListParams({ owner: "a".repeat(65) }).owner).toBe("all");
  });
  it("coerces page to an integer >= 1", () => {
    expect(parsePageListParams({ page: "2" }).page).toBe(2);
    expect(parsePageListParams({ page: "0" }).page).toBe(1);
    expect(parsePageListParams({ page: "-3" }).page).toBe(1);
    expect(parsePageListParams({ page: "x" }).page).toBe(1);
    expect(parsePageListParams({ page: "2.9" }).page).toBe(2);
  });
  it("trims q and takes the first value of arrays", () => {
    expect(parsePageListParams({ q: "  hi " }).q).toBe("hi");
    expect(parsePageListParams({ visibility: ["public", "org"] }).visibility).toBe("public");
  });
});

describe("pagesHref", () => {
  it("omits defaults for a clean /pages", () => {
    expect(pagesHref({})).toBe("/pages");
    expect(pagesHref({ visibility: "all", owner: "all", sort: "updated_desc", page: 1 })).toBe("/pages");
  });
  it("serializes non-default params", () => {
    expect(pagesHref({ visibility: "public", page: 2 })).toBe("/pages?visibility=public&page=2");
    expect(pagesHref({ q: "report", sort: "views_desc" })).toBe("/pages?q=report&sort=views_desc");
  });
  it("round-trips through the parser", () => {
    const href = pagesHref({ q: "x", visibility: "org", owner: "me", sort: "title_asc", page: 3 });
    const parsed = parsePageListParams(Object.fromEntries(new URL(`http://x${href}`).searchParams));
    expect(parsed).toEqual({ q: "x", visibility: "org", owner: "me", sort: "title_asc", page: 3 });
  });
  it("exposes a fixed page size of 25", () => {
    expect(PAGE_SIZE).toBe(25);
  });
  it("preserves the other filters alongside a canonical owner=me (redirect target)", () => {
    expect(pagesHref({ q: "x", visibility: "public", owner: "me", sort: "views_desc", page: 2 })).toBe(
      "/pages?q=x&visibility=public&owner=me&sort=views_desc&page=2",
    );
  });
});

describe("canonicalizeOwner", () => {
  it("collapses the current user's own id to the canonical me", () => {
    expect(canonicalizeOwner("u1", "u1")).toBe("me");
  });
  it("leaves me, all, and other owners untouched", () => {
    expect(canonicalizeOwner("me", "u1")).toBe("me");
    expect(canonicalizeOwner("all", "u1")).toBe("all");
    expect(canonicalizeOwner("u2", "u1")).toBe("u2");
  });
});
