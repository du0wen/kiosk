import { describe, expect, it } from "vitest";
import { viewerReducer } from "./viewer-state";

describe("viewerReducer", () => {
  it("resolves to loaded when the frame loads", () => {
    expect(viewerReducer("loading", "loaded")).toBe("loaded");
  });

  it("errors on timeout only while still loading", () => {
    expect(viewerReducer("loading", "timeout")).toBe("error");
    // A late timeout after the frame already loaded must not blank a good page.
    expect(viewerReducer("loaded", "timeout")).toBe("loaded");
  });

  it("errors on an explicit frame error", () => {
    expect(viewerReducer("loading", "errored")).toBe("error");
  });

  it("returns to loading on retry", () => {
    expect(viewerReducer("error", "retry")).toBe("loading");
  });

  it("still shows content if a load arrives after an error", () => {
    expect(viewerReducer("error", "loaded")).toBe("loaded");
  });
});
