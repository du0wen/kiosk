// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { createElement } from "react";

vi.mock("next-intl", () => ({ useTranslations: () => (k: string) => k }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
import { BrandingForm } from "./BrandingForm";

const base = { initialColor: "#0f766e", initialWatermark: "", organizationName: "Acme", action: vi.fn() };
afterEach(cleanup);

describe("BrandingForm access", () => {
  it("shows the editable form for owners/admins", () => {
    render(createElement(BrandingForm, { ...base, canEdit: true }));
    expect(screen.getByText("save")).toBeTruthy();
  });
  it("shows a read-only notice for members", () => {
    render(createElement(BrandingForm, { ...base, canEdit: false }));
    expect(screen.getByText("readOnly")).toBeTruthy();
    expect(screen.queryByText("save")).toBeNull();
  });
  it("does not render its own section heading (the Settings section provides it)", () => {
    const { container } = render(createElement(BrandingForm, { ...base, canEdit: true }));
    expect(container.textContent).not.toContain("workspaceVisuals");
  });
});
