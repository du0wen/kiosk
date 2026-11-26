"use client";
import { useEffect, useId, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { LogOut, UserRound } from "lucide-react";
import { useTranslations } from "next-intl";
import { authClient } from "@/lib/auth-client";
import styles from "./AccountMenu.module.css";
export function AccountMenu({ userName, userEmail, resetSignal }: { userName: string; userEmail: string; resetSignal?: boolean }) {
  const t = useTranslations("shell");
  const router = useRouter();
  const [openState, setOpenState] = useState({ open: false, resetSignal });
  const open = openState.resetSignal === resetSignal && openState.open;
  const menuRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const popoverId = useId();

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      if (!menuRef.current?.contains(event.target as Node)) setOpenState({ open: false, resetSignal });
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

  return <div ref={menuRef} className={styles.menu}>
    <button ref={triggerRef} type="button" className={styles.summary} aria-expanded={open} aria-controls={popoverId} onClick={() => setOpenState({ open: !open, resetSignal })}>
      <UserRound size={17} aria-hidden="true" /><span>{t("account")}</span>
    </button>
    {open && <div id={popoverId} className={styles.popover}>
      <strong>{userName}</strong>
      <small>{userEmail}</small>
      <button type="button" onClick={async () => { await authClient.signOut(); router.push("/sign-in"); router.refresh(); }}><LogOut size={16} aria-hidden="true" />{t("signOut")}</button>
    </div>}
  </div>;
}
