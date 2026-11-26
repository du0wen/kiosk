// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { createElement } from "react";

vi.mock("next-intl", () => ({ useTranslations: () => (key: string) => key }));

import AppError from "./error";

afterEach(cleanup);

describe("app error boundary", () => {
  it("provides the recovery UI above route-group layouts", () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    render(createElement(AppError, { error: new Error("dashboard layout failed"), reset: vi.fn() }));
    expect(screen.getByText("loadFailedTitle")).toBeTruthy();
    expect(screen.getByRole("button", { name: "retry" })).toBeTruthy();
    vi.mocked(console.error).mockRestore();
  });
});

