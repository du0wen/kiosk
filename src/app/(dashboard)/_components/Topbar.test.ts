// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render } from "@testing-library/react";
import { createElement } from "react";

vi.mock("next-intl", () => ({ useTranslations: () => (k: string) => k }));
import { Topbar } from "./Topbar";

afterEach(cleanup);

describe("Topbar", () => {
  it("renders only the menu button; search moved to the page toolbars", () => {
    const { container, getByLabelText } = render(createElement(Topbar, { onOpenNavigation: vi.fn() }));
    expect(getByLabelText("openMenu")).toBeTruthy();
    expect(container.querySelector('[role="search"]')).toBeNull();
  });
});
