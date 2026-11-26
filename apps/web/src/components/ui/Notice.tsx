import type { HTMLAttributes, ReactNode } from "react";
import { AlertCircle, CheckCircle2, Info, TriangleAlert } from "lucide-react";
import styles from "./Notice.module.css";

type Tone = "info" | "success" | "warning" | "danger";
const icons = { info: Info, success: CheckCircle2, warning: TriangleAlert, danger: AlertCircle };

export function Notice({ tone = "info", children, className, ...props }: HTMLAttributes<HTMLDivElement> & { tone?: Tone; children: ReactNode }) {
  const Icon = icons[tone];
  return <div role={tone === "danger" ? "alert" : "status"} className={[styles.notice, styles[tone], className].filter(Boolean).join(" ")} {...props}><Icon size={16} aria-hidden="true" /><div>{children}</div></div>;
}
