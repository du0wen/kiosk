import type { ReactNode } from "react";
import styles from "./EmptyState.module.css";

export function EmptyState({ icon, title, description, action }: { icon?: ReactNode; title: string; description: string; action?: ReactNode }) {
  return <div className={styles.empty}>{icon && <div className={styles.icon}>{icon}</div>}<strong>{title}</strong><p>{description}</p>{action}</div>;
}
