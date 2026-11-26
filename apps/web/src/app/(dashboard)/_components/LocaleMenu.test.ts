// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createElement } from "react";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock("next-intl", () => ({
  useLocale: () => "zh",
  useTranslations: () => (key: string) => key,
}));
vi.mock("@/i18n/locale", () => ({ setLocaleAction: vi.fn() }));

import { LocaleMenu } from "./LocaleMenu";

describe("<LocaleMenu/>", () => {
  afterEach(cleanup);

  it("shows the current locale only as a checked dropdown option", async () => {
    const user = userEvent.setup();
    render(createElement(LocaleMenu));

    const trigger = screen.getByRole("button", { name: "language" });
    expect(trigger.textContent).toBe("language");
    await user.click(trigger);
    expect(screen.getByRole("button", { name: "中文" }).getAttribute("aria-pressed")).toBe("true");
  });
});
