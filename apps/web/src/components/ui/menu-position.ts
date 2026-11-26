/**
 * Pure viewport-aware positioning for the portaled Menu popover.
 *
 * The menu renders in a portal with `position: fixed` so the DataTable's
 * `overflow-x: auto` can no longer clip it. This helper decides where the
 * fixed box goes: right-aligned under the trigger by default, flipped above
 * when the bottom would overflow, and always clamped inside the viewport.
 */
export type Rect = {
  top: number;
  left: number;
  right: number;
  bottom: number;
  width: number;
  height: number;
};
export type Size = { width: number; height: number };
export type Viewport = { width: number; height: number };
export type MenuPosition = { top: number; left: number; placement: "top" | "bottom" };

export function computeMenuPosition(
  anchor: Rect,
  menu: Size,
  viewport: Viewport,
  gap = 4,
): MenuPosition {
  // Horizontal: right-align to the trigger, then clamp inside the viewport.
  const maxLeft = Math.max(gap, viewport.width - gap - menu.width);
  const left = Math.min(Math.max(anchor.right - menu.width, gap), maxLeft);

  // Vertical: prefer below; flip above only when below overflows and above has more room.
  const below = anchor.bottom + gap;
  const roomBelow = viewport.height - below;
  const roomAbove = anchor.top - gap;

  if (menu.height > roomBelow && roomAbove > roomBelow) {
    return { top: Math.max(gap, anchor.top - gap - menu.height), left, placement: "top" };
  }
  const top = Math.min(below, Math.max(gap, viewport.height - gap - menu.height));
  return { top, left, placement: "bottom" };
}
