// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render } from "@testing-library/react";
import { createElement } from "react";
import { PageSection } from "./PageHeader";

afterEach(cleanup);

describe("PageSection", () => {
  it("applies a stable id for hash anchors", () => {
    const { container } = render(
      createElement(PageSection, { id: "branding", title: "Branding" }, createElement("p", null, "x")),
    );
    expect(container.querySelector("#branding")).not.toBeNull();
  });

  it("omits id when not provided", () => {
    const { container } = render(
      createElement(PageSection, { title: "General" }, createElement("p", null, "x")),
    );
    expect(container.querySelector("section")?.getAttribute("id")).toBeNull();
  });
});
