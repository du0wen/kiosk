import { describe, expect, it } from "vitest";
import { computeMenuPosition, type Rect } from "./menu-position";

const anchor = (over: Partial<Rect> = {}): Rect => ({
  top: 100,
  left: 400,
  right: 440,
  bottom: 140,
  width: 40,
  height: 40,
  ...over,
});
const viewport = { width: 1200, height: 800 };
const menu = { width: 180, height: 200 };

describe("computeMenuPosition", () => {
  it("opens below and right-aligned to the trigger", () => {
    const pos = computeMenuPosition(anchor(), menu, viewport, 4);
    expect(pos.placement).toBe("bottom");
    expect(pos.top).toBe(144); // bottom (140) + gap (4)
    expect(pos.left).toBe(260); // right (440) - menu width (180)
  });

  it("flips above when there is no room below and more room above", () => {
    const pos = computeMenuPosition(
      anchor({ top: 700, bottom: 740 }),
      menu,
      viewport,
      4,
    );
    expect(pos.placement).toBe("top");
    expect(pos.top).toBe(496); // 700 - 4 - 200
  });

  it("clamps to the left edge when the trigger sits near the left", () => {
    const pos = computeMenuPosition(
      anchor({ left: 10, right: 50 }),
      menu,
      viewport,
      8,
    );
    expect(pos.left).toBe(8); // right(50)-180 = -130, clamped to gap
  });

  it("clamps to the right edge so the menu never overflows", () => {
    const pos = computeMenuPosition(
      anchor({ left: 1180, right: 1195 }),
      menu,
      viewport,
      8,
    );
    expect(pos.left).toBe(1012); // viewport(1200) - gap(8) - menu(180)
  });

  it("never returns a negative top", () => {
    const tall = { width: 180, height: 900 };
    const pos = computeMenuPosition(anchor(), tall, viewport, 8);
    expect(pos.top).toBeGreaterThanOrEqual(8);
  });
});
