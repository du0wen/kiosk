// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { createElement } from "react";

vi.mock("next-intl", () => ({ useTranslations: () => (k: string) => k }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
import { BrandingForm } from "./BrandingForm";

const base = { initialColor: "#0f766e", initialWatermark: "", organizationName: "Acme" };
afterEach(cleanup);

describe("BrandingForm save feedback", () => {
  it("shows a success notice after a successful save", async () => {
    const action = vi.fn(async () => ({ ok: true as const }));
    const { container } = render(createElement(BrandingForm, { ...base, canEdit: true, action }));
    fireEvent.submit(container.querySelector("form")!);
    await waitFor(() => expect(screen.getByText("saved")).toBeTruthy());
    expect(action).toHaveBeenCalledTimes(1);
  });

  it("shows a failure notice (and no success) when the save fails", async () => {
    const action = vi.fn(async () => ({ ok: false as const, error: "failed" as const }));
    const { container } = render(createElement(BrandingForm, { ...base, canEdit: true, action }));
    fireEvent.submit(container.querySelector("form")!);
    await waitFor(() => expect(screen.getByText("saveFailed")).toBeTruthy());
    expect(screen.queryByText("saved")).toBeNull();
  });

  it("keeps the watermark the user typed after a failed save", async () => {
    const action = vi.fn(async () => ({ ok: false as const, error: "failed" as const }));
    const { container } = render(createElement(BrandingForm, { ...base, canEdit: true, action }));
    const input = container.querySelector<HTMLInputElement>('input[name="exportWatermark"]')!;
    fireEvent.change(input, { target: { value: "ACME — confidential" } });
    fireEvent.submit(container.querySelector("form")!);
    await waitFor(() => expect(screen.getByText("saveFailed")).toBeTruthy());
    expect(container.querySelector<HTMLInputElement>('input[name="exportWatermark"]')!.value).toBe("ACME — confidential");
  });
});
