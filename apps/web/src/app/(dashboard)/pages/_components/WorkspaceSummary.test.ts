// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from "vitest";
import { createElement } from "react";
import { cleanup, render, screen } from "@testing-library/react";
import { WorkspaceSummary } from "./WorkspaceSummary";

afterEach(cleanup);

const valueFor = (label: string) =>
  screen.getByText(label).parentElement?.querySelector("dd")?.textContent;

describe("<WorkspaceSummary/>", () => {
  it("renders the four workspace metrics as labeled label/value pairs", () => {
    render(
      createElement(WorkspaceSummary, {
        summary: { total: 5, publicCount: 2, orgCount: 3, totalViews: 40 },
        t: (key: string) => key,
        formatNumber: (n: number) => String(n),
      }),
    );
    expect(valueFor("summaryTotal")).toBe("5");
    expect(valueFor("summaryPublic")).toBe("2");
    expect(valueFor("summaryOrg")).toBe("3");
    expect(valueFor("summaryViews")).toBe("40");
  });

  it("formats numbers through the injected formatter", () => {
    render(
      createElement(WorkspaceSummary, {
        summary: { total: 1234, publicCount: 1000, orgCount: 234, totalViews: 98765 },
        t: (key: string) => key,
        formatNumber: (n: number) => n.toLocaleString("en-US"),
      }),
    );
    expect(valueFor("summaryViews")).toBe("98,765");
  });
});
