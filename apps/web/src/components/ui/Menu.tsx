"use client";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import { MoreHorizontal } from "lucide-react";
import { computeMenuPosition, type MenuPosition } from "./menu-position";
import styles from "./Menu.module.css";

export function Menu({ label, children }: { label: string; children: ReactNode }) {
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<MenuPosition | null>(null);

  const reposition = useCallback(() => {
    const trigger = triggerRef.current;
    const menu = menuRef.current;
    if (!trigger || !menu) return;
    const rect = trigger.getBoundingClientRect();
    setPos(
      computeMenuPosition(
        {
          top: rect.top,
          left: rect.left,
          right: rect.right,
          bottom: rect.bottom,
          width: rect.width,
          height: rect.height,
        },
        { width: menu.offsetWidth, height: menu.offsetHeight },
        { width: window.innerWidth, height: window.innerHeight },
      ),
    );
  }, []);

  // Measure once in the DOM, then keep the fixed box pinned to the trigger.
  useLayoutEffect(() => {
    if (!open) return;
    reposition();
    menuRef.current?.querySelector<HTMLElement>("a[href], button:not([disabled])")?.focus();
    const onReflow = () => reposition();
    window.addEventListener("scroll", onReflow, true);
    window.addEventListener("resize", onReflow);
    return () => {
      window.removeEventListener("scroll", onReflow, true);
      window.removeEventListener("resize", onReflow);
    };
  }, [open, reposition]);

  // Escape closes and restores focus; a pointer outside closes.
  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false);
        triggerRef.current?.focus();
      }
    };
    const onPointer = (event: PointerEvent) => {
      const target = event.target as Node;
      if (!menuRef.current?.contains(target) && !triggerRef.current?.contains(target)) {
        setOpen(false);
      }
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("pointerdown", onPointer);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("pointerdown", onPointer);
    };
  }, [open]);

  // Roving focus across the enabled actions; disabled buttons are skipped.
  // The disclosure keeps native controls, so Tab order is unchanged.
  const focusables = () =>
    Array.from(menuRef.current?.querySelectorAll<HTMLElement>("a[href], button:not([disabled])") ?? []);
  const onKeyDown = (event: ReactKeyboardEvent) => {
    if (!["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) return;
    const items = focusables();
    if (!items.length) return;
    event.preventDefault();
    const i = items.indexOf(document.activeElement as HTMLElement);
    if (event.key === "Home") items[0].focus();
    else if (event.key === "End") items[items.length - 1].focus();
    else if (event.key === "ArrowDown") items[i < 0 || i === items.length - 1 ? 0 : i + 1].focus();
    else items[i <= 0 ? items.length - 1 : i - 1].focus();
  };

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        className={styles.trigger}
        aria-expanded={open}
        aria-haspopup="true"
        aria-label={label}
        title={label}
        onClick={() => setOpen((value) => !value)}
      >
        <MoreHorizontal size={18} aria-hidden="true" />
      </button>
      {open &&
        createPortal(
          <div
            ref={menuRef}
            aria-label={label}
            className={styles.content}
            style={pos ? { top: pos.top, left: pos.left } : { visibility: "hidden" }}
            onKeyDown={onKeyDown}
            onClick={(event) => {
              if ((event.target as HTMLElement).closest("a, button")) setOpen(false);
            }}
          >
            {children}
          </div>,
          document.body,
        )}
    </>
  );
}

// Layout wrapper only — the real button/link inside carries the interactive
// semantics, so this deliberately does not add an ARIA menuitem role.
export function MenuItem({ children }: { children: ReactNode }) {
  return <div className={styles.item}>{children}</div>;
}
