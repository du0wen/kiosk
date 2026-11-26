"use client";
import { useEffect, useId, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { Check, ChevronDown, LoaderCircle } from "lucide-react";
import styles from "./SidebarDropdown.module.css";

export type SidebarDropdownOption = { value: string; label: string };

export function SidebarDropdown({
  label,
  value,
  options,
  onChange,
  children,
  disabled = false,
  busy = false,
  placement = "bottom",
  triggerClassName,
  popoverClassName,
  resetSignal,
}: {
  label: string;
  value: string;
  options: SidebarDropdownOption[];
  onChange: (value: string) => void | Promise<void>;
  children: ReactNode;
  disabled?: boolean;
  busy?: boolean;
  placement?: "top" | "bottom";
  triggerClassName?: string;
  popoverClassName?: string;
  resetSignal?: boolean;
}) {
  const [openState, setOpenState] = useState({ open: false, resetSignal });
  const open = openState.resetSignal === resetSignal && openState.open;
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const optionsRef = useRef<HTMLDivElement>(null);
  const popoverId = useId();

  useLayoutEffect(() => {
    if (!open) return;
    optionsRef.current?.querySelector<HTMLElement>('[aria-pressed="true"]')?.focus();
  }, [open, resetSignal]);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpenState({ open: false, resetSignal });
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpenState({ open: false, resetSignal });
        triggerRef.current?.focus();
      }
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open, resetSignal]);

  return <div ref={rootRef} className={styles.root}>
    <button
      ref={triggerRef}
      type="button"
      className={[styles.trigger, triggerClassName].filter(Boolean).join(" ")}
      aria-label={label}
      aria-expanded={open}
      aria-controls={popoverId}
      aria-busy={busy}
      disabled={disabled}
      onClick={() => setOpenState({ open: !open, resetSignal })}
    >
      {children}
      {busy ? <LoaderCircle className={styles.spinner} size={15} aria-hidden="true" /> : <ChevronDown size={15} aria-hidden="true" />}
    </button>
    {open && <div ref={optionsRef} id={popoverId} className={[styles.popover, styles[placement], popoverClassName].filter(Boolean).join(" ")}>
      {options.map((option) => {
        const selected = option.value === value;
        return <button
          key={option.value}
          type="button"
          className={[styles.option, selected && styles.selected].filter(Boolean).join(" ")}
          aria-pressed={selected}
          onClick={() => {
            setOpenState({ open: false, resetSignal });
            void onChange(option.value);
          }}
        >
          <span>{option.label}</span>
          {selected && <Check size={15} aria-hidden="true" />}
        </button>;
      })}
    </div>}
  </div>;
}
