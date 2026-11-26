import { getRequestConfig } from "next-intl/server";
import { cookies, headers } from "next/headers";
import { defaultLocale, isLocale, type Locale } from "./config";

function pick(value: string | undefined | null): Locale {
  return isLocale(value) ? value : defaultLocale;
}

export default getRequestConfig(async () => {
  const cookieLocale = (await cookies()).get("locale")?.value;
  let locale = pick(cookieLocale);
  if (!cookieLocale) {
    const al = (await headers()).get("accept-language") ?? "";
    if (al.toLowerCase().includes("zh")) locale = "zh";
  }
  return {
    locale,
    messages: (await import(`../../messages/${locale}.json`)).default,
  };
});
