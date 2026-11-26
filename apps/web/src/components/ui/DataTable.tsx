import type { ReactNode } from "react";
import styles from "./DataTable.module.css";
import type { TablePriority } from "./variants";

export type DataTableColumn<T> = { key: string; header: ReactNode; render: (row: T) => ReactNode; priority?: TablePriority; align?: "start" | "end" };

export function DataTable<T>({ columns, rows, getRowKey, empty }: { columns: readonly DataTableColumn<T>[]; rows: readonly T[]; getRowKey: (row: T) => string; empty?: ReactNode }) {
  if (!rows.length && empty) return <>{empty}</>;
  return <div className={styles.viewport}><table className={styles.table}><thead><tr>{columns.map((column) => <th key={column.key} className={[styles[column.priority === "low" ? "priorityLow" : column.priority === "medium" ? "priorityMedium" : "priorityEssential"], column.align === "end" && styles.end].filter(Boolean).join(" ")}>{column.header}</th>)}</tr></thead><tbody>{rows.map((row) => <tr key={getRowKey(row)}>{columns.map((column) => <td key={column.key} data-label={typeof column.header === "string" ? column.header : undefined} className={[styles[column.priority === "low" ? "priorityLow" : column.priority === "medium" ? "priorityMedium" : "priorityEssential"], column.align === "end" && styles.end].filter(Boolean).join(" ")}>{column.render(row)}</td>)}</tr>)}</tbody></table></div>;
}
