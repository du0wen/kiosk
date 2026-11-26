"use client";
import {
  useCallback, useEffect, useId, useLayoutEffect, useRef, useState,
  type KeyboardEvent as ReactKeyboardEvent,
} from "react";
import { createPortal } from "react-dom";
import { Check, ChevronDown } from "lucide-react";
import { computeMenuPosition, type MenuPosition } from "./menu-position";
import styles from "./Select.module.css";

export type SelectOption = { value: string; label: string; disabled?: boolean };

/**
 * Shared custom select: a listbox popover matching the field/menu design tokens
 * (not the native <select>). Focus stays on the trigger (a `combobox`); the
 * highlighted option is tracked with `aria-activedescendant`, so Tab / Shift+Tab
 * follow the browser's default order and simply close the popover as focus
 * leaves the trigger+listbox pair. The popover portals to the nearest open
 * <dialog> (or <body>) and is positioned `fixed` + viewport-clamped, so neither
 * an `overflow` parent nor a modal dialog's top layer can clip or occlude it.
 * A hidden input mirrors the value (written imperatively on select) so a
 * synchronous `new FormData()` in onValueChange already sees it. Controlled
 * (`value`) and uncontrolled (`defaultValue`) are both supported.
 */
export function Select({
  label, name, value, defaultValue, options, disabled = false,
  error, help, placeholder, className, onValueChange,
}: {
  label: string;
  name?: string;
  value?: string;
  defaultValue?: string;
  options: SelectOption[];
  disabled?: boolean;
  error?: string;
  help?: string;
  placeholder?: string;
  className?: string;
  onValueChange?: (value: string) => void;
}) {
  const isControlled = value !== undefined;
  const [internal, setInternal] = useState(defaultValue ?? "");
  const selected = isControlled ? (value as string) : internal;

  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<(MenuPosition & { width: number }) | null>(null);
  const [activeIndex, setActiveIndex] = useState(-1);
  const [portalTarget, setPortalTarget] = useState<Element | null>(null);

  const triggerRef = useRef<HTMLButtonElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const labelId = useId();
  const valueId = useId();
  const descriptionId = useId();
  const listId = useId();
  const optionId = (index: number) => `${listId}-o${index}`;

  // Keep the hidden input current so `new FormData(form)` always reads the value.
  useEffect(() => { if (inputRef.current) inputRef.current.value = selected; }, [selected]);

  const selectedOption = options.find((option) => option.value === selected);
  const firstEnabled = options.findIndex((option) => !option.disabled);

  const reposition = useCallback(() => {
    const trigger = triggerRef.current; const list = listRef.current;
    if (!trigger || !list) return;
    const r = trigger.getBoundingClientRect();
    setPos({
      ...computeMenuPosition(
        { top: r.top, left: r.left, right: r.right, bottom: r.bottom, width: r.width, height: r.height },
        { width: r.width, height: list.offsetHeight },
        { width: window.innerWidth, height: window.innerHeight },
      ),
      width: r.width,
    });
  }, []);

  // Measure + place while pinned to the trigger.
  useLayoutEffect(() => {
    if (!open) return;
    reposition();
    const onReflow = () => reposition();
    window.addEventListener("scroll", onReflow, true);
    window.addEventListener("resize", onReflow);
    return () => {
      window.removeEventListener("scroll", onReflow, true);
      window.removeEventListener("resize", onReflow);
    };
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  // A pointer outside closes; focus leaving the trigger+listbox pair (Tab /
  // Shift+Tab) closes without hijacking the browser's tab order. Both listeners
  // are scoped to the open state and torn down on close/unmount (no leaks).
  useEffect(() => {
    if (!open) return;
    const outside = (target: Node) => !listRef.current?.contains(target) && !triggerRef.current?.contains(target);
    const onPointerDown = (event: PointerEvent) => { if (outside(event.target as Node)) setOpen(false); };
    const onFocusIn = (event: FocusEvent) => { if (outside(event.target as Node)) setOpen(false); };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("focusin", onFocusIn);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("focusin", onFocusIn);
    };
  }, [open]);

  const choose = (option: SelectOption) => {
    if (option.disabled) return;
    if (inputRef.current) inputRef.current.value = option.value; // sync before consumers read FormData
    if (!isControlled) setInternal(option.value);
    onValueChange?.(option.value);
    setOpen(false);
    triggerRef.current?.focus();
  };

  const step = (dir: 1 | -1) => {
    const n = options.length;
    let i = activeIndex;
    for (let k = 0; k < n; k++) {
      i = (i + dir + n) % n;
      if (!options[i]?.disabled) { setActiveIndex(i); return; }
    }
  };
  const edge = (end: "first" | "last") => {
    const order = options.map((_, i) => i);
    if (end === "last") order.reverse();
    const target = order.find((i) => !options[i].disabled);
    if (target !== undefined) setActiveIndex(target);
  };

  // Open in the handler (not an effect) so seeding the highlight + portal target
  // doesn't cause a post-render setState cascade.
  const openList = () => {
    const sel = options.findIndex((option) => option.value === selected && !option.disabled);
    setActiveIndex(sel >= 0 ? sel : firstEnabled);
    setPortalTarget(triggerRef.current?.closest("dialog") ?? (typeof document !== "undefined" ? document.body : null));
    setOpen(true);
  };

  const onTriggerKeyDown = (event: ReactKeyboardEvent) => {
    if (disabled) return;
    if (!open) {
      if (["ArrowDown", "ArrowUp", "Enter", " "].includes(event.key)) { event.preventDefault(); openList(); }
      return;
    }
    switch (event.key) {
      case "ArrowDown": event.preventDefault(); step(1); break;
      case "ArrowUp": event.preventDefault(); step(-1); break;
      case "Home": event.preventDefault(); edge("first"); break;
      case "End": event.preventDefault(); edge("last"); break;
      case "Enter":
      case " ": {
        event.preventDefault();
        const option = options[activeIndex];
        if (option) choose(option);
        break;
      }
      case "Escape": event.preventDefault(); setOpen(false); break;
      // Tab / Shift+Tab: no preventDefault — the browser moves focus and the
      // focusin listener closes the popover.
    }
  };

  return (
    <div className={[styles.field, className].filter(Boolean).join(" ")}>
      <span className={styles.label} id={labelId}>{label}</span>
      <button
        ref={triggerRef}
        type="button"
        role="combobox"
        className={[styles.trigger, error && styles.invalid].filter(Boolean).join(" ")}
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listId}
        aria-activedescendant={open && activeIndex >= 0 ? optionId(activeIndex) : undefined}
        aria-labelledby={`${labelId} ${valueId}`}
        aria-describedby={error || help ? descriptionId : undefined}
        onClick={() => (open ? setOpen(false) : openList())}
        onKeyDown={onTriggerKeyDown}
      >
        <span className={styles.value} id={valueId}>{selectedOption?.label ?? placeholder ?? ""}</span>
        <ChevronDown className={styles.chevron} size={16} aria-hidden="true" />
      </button>
      {name && <input ref={inputRef} type="hidden" name={name} defaultValue={selected} />}
      {(error || help) && <span id={descriptionId} className={error ? styles.error : styles.help}>{error ?? help}</span>}
      {open && portalTarget && createPortal(
        <div
          ref={listRef}
          id={listId}
          role="listbox"
          aria-labelledby={labelId}
          className={styles.popover}
          style={pos ? { top: pos.top, left: pos.left, width: pos.width } : { visibility: "hidden" }}
        >
          {options.map((option, index) => {
            const isSelected = option.value === selected;
            return (
              <div
                key={option.value}
                id={optionId(index)}
                role="option"
                aria-selected={isSelected}
                aria-disabled={option.disabled || undefined}
                className={[styles.option, index === activeIndex && styles.active, isSelected && styles.selected, option.disabled && styles.optionDisabled].filter(Boolean).join(" ")}
                onMouseDown={(event) => event.preventDefault()} // keep focus on the trigger
                onClick={() => choose(option)}
              >
                <span>{option.label}</span>
                {isSelected && <Check size={15} aria-hidden="true" />}
              </div>
            );
          })}
        </div>,
        portalTarget,
      )}
    </div>
  );
}
