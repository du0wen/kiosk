// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createElement } from "react";

vi.mock("next-intl", () => ({ useTranslations: () => (key: string) => key }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));

import { StorageClient } from "./StorageClient";

afterEach(cleanup);

describe("StorageClient credential boundary", () => {
  it("renders only safe profile fields and opens edit with blank replacement secrets", async () => {
    const user = userEvent.setup();
    const { container } = render(
      createElement(StorageClient, {
        profiles: [{
          id: "profile-a",
          name: "R2",
          provider: "s3" as const,
          config: { region: "auto", bucket: "private", forcePathStyle: false },
          enabled: false,
          isDefault: false,
          status: "healthy" as const,
          lastCheckedAt: null,
          lastErrorCode: null,
          createdAt: new Date(0).toISOString(),
          updatedAt: new Date(0).toISOString(),
          objectCount: 0,
          storedBytes: 0,
        }],
        allowFilesystem: true,
        migrations: [],
        storageMode: "database",
        saveAction: vi.fn(),
        operationAction: vi.fn(),
      }),
    );
    expect(container.textContent).not.toContain("credential-secret");
    await user.click(screen.getByRole("button", { name: "actions: R2" }));
    await user.click(screen.getByRole("button", { name: "edit" }));
    const secret = screen.getByLabelText("secretAccessKey") as HTMLInputElement;
    const access = screen.getByLabelText("accessKeyId") as HTMLInputElement;
    expect(secret.value).toBe("");
    expect(access.value).toBe("");
  });

  it("keeps the confirmation dialog open when deletion fails", async () => {
    const user = userEvent.setup();
    const operationAction = vi.fn().mockResolvedValue({ ok: false, error: "profile_in_use" });
    render(
      createElement(StorageClient, {
        profiles: [{
          id: "profile-a",
          name: "R2",
          provider: "s3" as const,
          config: { region: "auto", bucket: "private", forcePathStyle: false },
          enabled: false,
          isDefault: false,
          status: "healthy" as const,
          lastCheckedAt: new Date(0).toISOString(),
          lastErrorCode: null,
          createdAt: new Date(0).toISOString(),
          updatedAt: new Date(0).toISOString(),
          objectCount: 0,
          storedBytes: 0,
        }],
        allowFilesystem: true,
        migrations: [],
        storageMode: "database",
        saveAction: vi.fn(),
        operationAction,
      }),
    );

    await user.click(screen.getByRole("button", { name: "actions: R2" }));
    await user.click(screen.getByRole("button", { name: "delete" }));
    const dialog = screen.getByRole("dialog");
    await user.click(within(dialog).getByRole("button", { name: "delete" }));

    await waitFor(() => expect(operationAction).toHaveBeenCalledOnce());
    expect(screen.getByRole("dialog")).toBeTruthy();
    expect(screen.getByText("actionFailed")).toBeTruthy();
  });
});
