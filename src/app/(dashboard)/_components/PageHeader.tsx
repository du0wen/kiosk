import type { ReactNode } from "react";
import styles from "./PageHeader.module.css";
export function PageHeader({ title, subtitle, actions }: { title: string; subtitle: string; actions?: ReactNode }) { return <header className={styles.header}><div><h1>{title}</h1><p>{subtitle}</p></div>{actions && <div className={styles.actions}>{actions}</div>}</header>; }
export function PageSection({ id, title, description, children }: { id?: string; title?: string; description?: string; children: ReactNode }) { return <section id={id} className={styles.section}>{(title || description) && <div className={styles.sectionHeader}>{title && <h2>{title}</h2>}{description && <p>{description}</p>}</div>}{children}</section>; }
