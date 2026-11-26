export const TEMPLATE_CATEGORIES = [
  "report",
  "proposal",
  "dashboard",
  "doc",
  "deck",
  "custom",
] as const;

export type TemplateCategory = (typeof TEMPLATE_CATEGORIES)[number];

export function isTemplateCategory(value: string): value is TemplateCategory {
  return (TEMPLATE_CATEGORIES as readonly string[]).includes(value);
}
