"use server";
import { cookies } from "next/headers";

export async function setLocaleAction(locale: "en" | "zh"): Promise<void> {
  (await cookies()).set("locale", locale, {
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
  });
}
