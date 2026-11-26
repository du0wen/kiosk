import styles from "./Progress.module.css";

export function Progress({
  value,
  max,
  label,
}: {
  value: number;
  max: number;
  label: string;
}) {
  const safeMax = Math.max(1, max);
  const safeValue = Math.min(Math.max(0, value), safeMax);
  return (
    <progress
      className={styles.progress}
      value={safeValue}
      max={safeMax}
      aria-label={label}
    />
  );
}
