import { getRequestConfig } from "next-intl/server";
import { cookies, headers } from "next/headers";

const SUPPORTED = ["en", "zh"] as const;
type Locale = (typeof SUPPORTED)[number];

function pick(value: string | undefined | null): Locale {
  if (value && (SUPPORTED as readonly string[]).includes(value)) {
    return value as Locale;
  }
  return "en";
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
