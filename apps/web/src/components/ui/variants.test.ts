import { describe, expect, it } from "vitest";
import { badgeToneClass, buttonClass, tablePriorityClass } from "./variants";

describe("ui variants", () => {
  it("builds stable button variants", () => {
    expect(buttonClass("primary", "md")).toBe("button primary md");
    expect(buttonClass("danger", "sm")).toBe("button danger sm");
  });

  it("maps status and responsive priority", () => {
    expect(badgeToneClass("success")).toBe("badge success");
    expect(tablePriorityClass("low")).toBe("priorityLow");
  });
});
