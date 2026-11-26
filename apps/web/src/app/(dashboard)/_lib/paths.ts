import type { Route } from "next";

export const LEGACY_REDIRECTS = {
  "/branding": "/settings/branding",
  "/api-tokens": "/settings/api-tokens",
  "/settings/members": "/members",
  "/settings/tokens": "/settings/api-tokens",
} as const;

const segment = (value: string) => encodeURIComponent(value);

export const dashboardPath = {
  pageDetail(pageId: string): Route {
    return `/pages/${segment(pageId)}` as Route;
  },
  pageHistory(pageId: string): Route {
    return `/pages/${segment(pageId)}/history` as Route;
  },
  pageExport(
    pageId: string,
    format: "md" | "html" | "pdf" | "png" | "jpeg",
  ): Route {
    return `/pages/${segment(pageId)}/export?format=${format}` as Route;
  },
};
