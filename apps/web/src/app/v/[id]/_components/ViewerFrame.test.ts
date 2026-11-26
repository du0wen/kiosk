// @vitest-environment happy-dom
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createElement } from "react";
import { cleanup, render, screen } from "@testing-library/react";

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
}));

import { ViewerFrame } from "./ViewerFrame";

const props = {
  // about:blank keeps happy-dom from attempting a real network fetch for the frame.
  src: "about:blank",
  rawUrl: "https://serve.example/p/abc",
  reportHref: "/report?url=x",
  consoleHref: "/pages",
  brandName: "Kiosk",
  accent: "#0f766e",
  title: "Quarterly report",
};

describe("<ViewerFrame/> header actions", () => {
  afterEach(cleanup);

  it("labels every action so the mobile icon-only variant keeps an accessible name", () => {
    render(createElement(ViewerFrame, props));
    const links = screen.getAllByRole("link");
    expect(links).toHaveLength(3);
    for (const link of links) {
      // Icon is aria-hidden, so the link itself must carry the name + tooltip;
      // otherwise hiding the text on mobile leaves an unlabeled icon button.
      expect(link.getAttribute("aria-label")).toBeTruthy();
      expect(link.getAttribute("title")).toBeTruthy();
    }
  });

  it("wraps each action's visible text so the stylesheet can hide it on mobile", () => {
    render(createElement(ViewerFrame, props));
    for (const link of screen.getAllByRole("link")) {
      const label = link.querySelector("span");
      expect(label).not.toBeNull();
      expect(label?.textContent?.length).toBeGreaterThan(0);
    }
  });
});

// happy-dom rewrites import.meta.url to an http URL, so anchor CSS reads to the
// project root (vitest's cwd) instead.
const cssFile = () =>
  readFile(join(process.cwd(), "src/app/v/[id]/_components/ViewerFrame.module.css"), "utf8");

describe("ViewerFrame mobile layout", () => {
  it("collapses the header actions to icon-only instead of forcing three text labels", async () => {
    const css = await cssFile();
    // A label class must exist to be hidden.
    expect(css).toMatch(/\.label\b/);
    // A mobile breakpoint hides the action text so three labels never stay on one row.
    expect(css).toMatch(
      /@media\s*\(max-width:[^)]*\)\s*\{[\s\S]*?\.label\s*\{[^}]*display:\s*none/,
    );
  });

  it("truncates an overlong brand name rather than pushing the actions off-screen", async () => {
    const css = await cssFile();
    expect(css).toMatch(/\.brand\s*\{[^}]*text-overflow:\s*ellipsis/);
    expect(css).toMatch(/\.brand\s*\{[^}]*overflow:\s*hidden/);
  });
});

describe("<ViewerFrame/> anti-phishing disclaimer", () => {
  afterEach(cleanup);

  it("displays the safety disclaimer banner initially", () => {
    render(createElement(ViewerFrame, props));
    const banner = screen.getByRole("status", { name: "disclaimer" });
    expect(banner).not.toBeNull();
    expect(banner.textContent).toContain("disclaimer");
  });

  it("dismisses the banner when clicking the dismiss button", async () => {
    const { fireEvent } = await import("@testing-library/react");
    render(createElement(ViewerFrame, props));
    const dismissBtn = screen.getByRole("button", { name: "dismissDisclaimer" });
    expect(screen.queryByRole("status", { name: "disclaimer" })).not.toBeNull();
    fireEvent.click(dismissBtn);
    expect(screen.queryByRole("status", { name: "disclaimer" })).toBeNull();
  });
});
