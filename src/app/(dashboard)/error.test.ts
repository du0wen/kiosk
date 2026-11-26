// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { createElement } from "react";

vi.mock("next-intl", () => ({ useTranslations: () => (k: string) => k }));
import DashboardError from "./error";

let errorSpy: ReturnType<typeof vi.spyOn>;
beforeEach(() => { errorSpy = vi.spyOn(console, "error").mockImplementation(() => {}); });
afterEach(() => { cleanup(); errorSpy.mockRestore(); });

describe("dashboard error boundary", () => {
  it("shows a failure state with title, body, and a Retry action", () => {
    render(createElement(DashboardError, { error: Object.assign(new Error("neon down"), { digest: "x" }), reset: vi.fn() }));
    expect(screen.getByText("loadFailedTitle")).toBeTruthy();
    expect(screen.getByText("loadFailedBody")).toBeTruthy();
    expect(screen.getByRole("button", { name: "retry" })).toBeTruthy();
  });

  it("calls reset() on Retry and logs the error instead of swallowing it", () => {
    const reset = vi.fn();
    render(createElement(DashboardError, { error: new Error("neon down"), reset }));
    fireEvent.click(screen.getByRole("button", { name: "retry" }));
    expect(reset).toHaveBeenCalledTimes(1);
    expect(errorSpy).toHaveBeenCalled();
  });
});
