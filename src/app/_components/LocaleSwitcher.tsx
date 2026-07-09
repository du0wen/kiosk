"use client";
import { useRouter } from "next/navigation";
import { setLocaleAction } from "@/i18n/locale";

export function LocaleSwitcher() {
  const router = useRouter();
  return (
    <select
      defaultValue=""
      onChange={async (e) => {
        await setLocaleAction(e.target.value as "en" | "zh");
        router.refresh();
      }}
      aria-label="Language"
    >
      <option value="" disabled>
        🌐
      </option>
      <option value="en">English</option>
      <option value="zh">中文</option>
    </select>
  );
}
