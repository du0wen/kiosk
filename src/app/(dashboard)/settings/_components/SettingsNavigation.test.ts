// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { createElement } from "react";

let mockPathname = "/settings";
vi.mock("next-intl", () => ({ useTranslations: () => (k: string) => k }));
vi.mock("next/navigation", () => ({ usePathname: () => mockPathname }));
vi.mock("next/link", () => ({
  default: ({ href, children, ...rest }: { href: string; children: unknown }) =>
    createElement("a", { href, ...rest }, children as never),
}));
import { SettingsNavigation } from "./SettingsNavigation";
import { PlatformAdminProvider } from "../../_components/PlatformAdminContext";

afterEach(cleanup);

describe("SettingsNavigation", () => {
  it("links each item to its real route (no hash navigation)", () => {
    mockPathname = "/settings";
    render(createElement(SettingsNavigation));
    expect(screen.getByRole("link", { name: "general" }).getAttribute("href")).toBe("/settings");
    expect(screen.getByRole("link", { name: "branding" }).getAttribute("href")).toBe("/settings/branding");
    expect(screen.getByRole("link", { name: "apiTokens" }).getAttribute("href")).toBe("/settings/api-tokens");
    expect(screen.queryByRole("link", { name: "storage" })).toBeNull();
    // No hash-based internal navigation remains.
    for (const name of ["general", "branding", "apiTokens"]) {
      expect(screen.getByRole("link", { name }).getAttribute("href")).not.toContain("#");
    }
  });

  it("shows Storage only to platform admins and marks its route active", () => {
    mockPathname = "/settings/storage";
    render(createElement(PlatformAdminProvider, { value: true }, createElement(SettingsNavigation)));
    const storage = screen.getByRole("link", { name: "storage" });
    expect(storage.getAttribute("href")).toBe("/settings/storage");
    expect(storage.getAttribute("aria-current")).toBe("page");
  });

  it("marks only General active on /settings", () => {
    mockPathname = "/settings";
    render(createElement(SettingsNavigation));
    expect(screen.getByRole("link", { name: "general" }).getAttribute("aria-current")).toBe("page");
    expect(screen.getByRole("link", { name: "branding" }).getAttribute("aria-current")).toBeNull();
    expect(screen.getByRole("link", { name: "apiTokens" }).getAttribute("aria-current")).toBeNull();
  });

  it("marks only Branding active on /settings/branding", () => {
    mockPathname = "/settings/branding";
    render(createElement(SettingsNavigation));
    expect(screen.getByRole("link", { name: "branding" }).getAttribute("aria-current")).toBe("page");
    expect(screen.getByRole("link", { name: "general" }).getAttribute("aria-current")).toBeNull();
    expect(screen.getByRole("link", { name: "apiTokens" }).getAttribute("aria-current")).toBeNull();
  });

  it("marks only API Tokens active on /settings/api-tokens", () => {
    mockPathname = "/settings/api-tokens";
    render(createElement(SettingsNavigation));
    expect(screen.getByRole("link", { name: "apiTokens" }).getAttribute("aria-current")).toBe("page");
    expect(screen.getByRole("link", { name: "general" }).getAttribute("aria-current")).toBeNull();
    expect(screen.getByRole("link", { name: "branding" }).getAttribute("aria-current")).toBeNull();
  });
});
