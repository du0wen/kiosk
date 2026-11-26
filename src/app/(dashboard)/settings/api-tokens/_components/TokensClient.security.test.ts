// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { createElement } from "react";

vi.mock("next-intl", () => ({
  useTranslations: () => (k: string) => k,
  useLocale: () => "en",
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
import { TokensClient } from "./TokensClient";

afterEach(cleanup);

const SECRET = "kiosk_api_TESTSECRETdoNotLeak123";

describe("API token one-time value", () => {
  it("renders only a hash fingerprint for existing tokens", () => {
    const { container } = render(createElement(TokensClient, {
      tokens: [{
        id: "token-1", name: "Deploy", tokenFingerprint: "8f32a7c19bd4",
        createdAt: new Date(0).toISOString(), lastUsedAt: null,
        revokedAt: null, creator: "Kevin", expiresAt: null,
        scopes: ["identity:read", "pages:read", "pages:write", "pages:export"],
      }],
      createAction: vi.fn(), revokeAction: vi.fn(),
    }));
    expect(container.textContent).toContain("8f32a7c19bd4");
    expect(container.textContent).not.toContain("kiosk_api_••••••");
    expect(container.textContent).not.toContain("kiosk_api_fF99d4");
  });

  it("submits explicit default scopes and a 90-day expiration", async () => {
    const createAction = vi.fn(async () => ({ ok: false as const, error: "failed" as const }));
    const { container } = render(
      createElement(TokensClient, { tokens: [], createAction, revokeAction: vi.fn() }),
    );
    const form = container.querySelector<HTMLFormElement>("#create-token")!;
    fireEvent.change(form.querySelector<HTMLInputElement>('input[name="name"]')!, {
      target: { value: "Scoped token" },
    });
    fireEvent.submit(form);
    await waitFor(() => expect(createAction).toHaveBeenCalledOnce());
    const data = createAction.mock.calls[0][0] as FormData;
    expect(data.getAll("scopes")).toEqual([
      "identity:read",
      "pages:read",
      "pages:write",
      "pages:export",
    ]);
    expect(data.get("expiresInDays")).toBe("90");
  });

  it("shows the plaintext once from the action result and never in the URL", async () => {
    const createAction = vi.fn(async () => ({ ok: true as const, token: SECRET }));
    const { container } = render(
      createElement(TokensClient, { tokens: [], createAction, revokeAction: vi.fn() }),
    );
    const form = container.querySelector<HTMLFormElement>("#create-token")!;
    const nameInput = form.querySelector<HTMLInputElement>('input[name="name"]')!;
    fireEvent.change(nameInput, { target: { value: "CI token" } });
    fireEvent.submit(form);

    // Plaintext shows in-page, sourced from the action result.
    await waitFor(() => expect(screen.getByText(SECRET)).toBeTruthy());
    // ...and is never written to the URL (path, query, or hash).
    expect(window.location.href).not.toContain(SECRET);
    expect(window.location.search).toBe("");
    expect(window.location.hash).toBe("");
    // A copy affordance is offered for the one-time value.
    expect(screen.getByLabelText("copy")).toBeTruthy();
  });

  it("shows an error (without the token) when creation fails", async () => {
    const createAction = vi.fn(async () => ({ ok: false as const, error: "failed" as const }));
    const { container } = render(
      createElement(TokensClient, { tokens: [], createAction, revokeAction: vi.fn() }),
    );
    const form = container.querySelector<HTMLFormElement>("#create-token")!;
    fireEvent.change(form.querySelector<HTMLInputElement>('input[name="name"]')!, { target: { value: "x" } });
    fireEvent.submit(form);
    await waitFor(() => expect(screen.getByText("createFailed")).toBeTruthy());
    expect(screen.queryByText(SECRET)).toBeNull();
  });
});
