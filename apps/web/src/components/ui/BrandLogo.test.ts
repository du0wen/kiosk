import { describe, expect, it } from "vitest";
import { createElement } from "react";
import { renderToString } from "react-dom/server";
import { BrandLogo } from "./BrandLogo";

describe("BrandLogo Component", () => {
  it("renders an SVG with default size of 20", () => {
    const html = renderToString(createElement(BrandLogo));
    expect(html).toContain("<svg");
    expect(html).toContain('width="20"');
    expect(html).toContain('height="20"');
    expect(html).toContain('viewBox="0 0 32 32"');
  });

  it("accepts custom size and className", () => {
    const html = renderToString(createElement(BrandLogo, { size: 32, className: "custom-logo" }));
    expect(html).toContain('width="32"');
    expect(html).toContain('height="32"');
    expect(html).toContain('class="custom-logo"');
  });
});
