// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { createElement } from "react";

vi.mock("next-intl", () => ({ useTranslations: () => (key: string) => key }));

import { ApplicationError } from "./ApplicationError";

let errorSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  cleanup();
  errorSpy.mockRestore();
});

describe("ApplicationError", () => {
  it("renders translated recovery copy and logs the original error", () => {
    const error = Object.assign(new Error("database unavailable"), { digest: "digest" });

    render(createElement(ApplicationError, { error, reset: vi.fn() }));

    expect(screen.getByText("loadFailedTitle")).toBeTruthy();
    expect(screen.getByText("loadFailedBody")).toBeTruthy();
    expect(screen.getByRole("button", { name: "retry" })).toBeTruthy();
    expect(errorSpy).toHaveBeenCalledWith("Application render error:", error);
  });

  it("calls reset exactly once when Retry is activated", () => {
    const reset = vi.fn();

    render(createElement(ApplicationError, { error: new Error("failed"), reset }));
    fireEvent.click(screen.getByRole("button", { name: "retry" }));

    expect(reset).toHaveBeenCalledTimes(1);
  });
});

