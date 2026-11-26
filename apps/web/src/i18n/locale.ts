"use server";
import { cookies } from "next/headers";
import { isLocale, type Locale } from "./config";

export async function setLocaleAction(locale: Locale): Promise<void> {
  if (!isLocale(locale)) return;
  (await cookies()).set("locale", locale, {
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
  });
}
