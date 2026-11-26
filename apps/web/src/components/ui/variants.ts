export type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";
export type ControlSize = "sm" | "md" | "lg";
export type BadgeTone = "neutral" | "info" | "success" | "warning" | "danger";
export type TablePriority = "essential" | "medium" | "low";

export const buttonClass = (variant: ButtonVariant, size: ControlSize) =>
  `button ${variant} ${size}`;
export const badgeToneClass = (tone: BadgeTone) => `badge ${tone}`;
export const tablePriorityClass = (priority: TablePriority) =>
  priority === "essential" ? "priorityEssential" : priority === "medium" ? "priorityMedium" : "priorityLow";
