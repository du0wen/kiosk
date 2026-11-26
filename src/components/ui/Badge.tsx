import type { HTMLAttributes } from "react";
import styles from "./Badge.module.css";
import type { BadgeTone } from "./variants";

export function Badge({ tone = "neutral", className, ...props }: HTMLAttributes<HTMLSpanElement> & { tone?: BadgeTone }) {
  return <span className={[styles.badge, styles[tone], className].filter(Boolean).join(" ")} {...props} />;
}
