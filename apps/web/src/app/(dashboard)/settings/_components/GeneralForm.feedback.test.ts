// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { createElement } from "react";

vi.mock("next-intl", () => ({ useTranslations: () => (k: string) => k }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
import { GeneralForm } from "./GeneralForm";

const base = { organizationId: "org_123", organizationName: "Acme", role: "owner", canEdit: true };
afterEach(cleanup);

describe("GeneralForm save feedback", () => {
  it("shows a success notice after saving", async () => {
    const action = vi.fn(async () => ({ ok: true as const }));
    const { container } = render(createElement(GeneralForm, { ...base, action }));
    fireEvent.submit(container.querySelector("form")!);
    await waitFor(() => expect(screen.getByText("saved")).toBeTruthy());
  });

  it("keeps the name the user typed after a failed save", async () => {
    const action = vi.fn(async () => ({ ok: false as const, error: "invalid" as const }));
    const { container } = render(createElement(GeneralForm, { ...base, action }));
    const input = container.querySelector<HTMLInputElement>('input[name="name"]')!;
    fireEvent.change(input, { target: { value: "New Name" } });
    fireEvent.submit(container.querySelector("form")!);
    await waitFor(() => expect(screen.getByText("nameRequired")).toBeTruthy());
    expect(container.querySelector<HTMLInputElement>('input[name="name"]')!.value).toBe("New Name");
  });

  it("shows a read-only notice for members and no save button", () => {
    render(createElement(GeneralForm, { ...base, canEdit: false, action: vi.fn() }));
    expect(screen.getByText("readOnly")).toBeTruthy();
    expect(screen.queryByText("save")).toBeNull();
  });
});
