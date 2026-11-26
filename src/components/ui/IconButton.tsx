import type { ButtonHTMLAttributes, ReactNode } from "react";
import { Button } from "./Button";
import type { ButtonVariant, ControlSize } from "./variants";
import styles from "./IconButton.module.css";

type Props = Omit<ButtonHTMLAttributes<HTMLButtonElement>, "aria-label"> & {
  label: string;
  icon: ReactNode;
  variant?: ButtonVariant;
  size?: ControlSize;
};

export function IconButton({ label, icon, variant = "ghost", size = "md", className, ...props }: Props) {
  return (
    <Button
      aria-label={label}
      title={label}
      variant={variant}
      size={size}
      className={[styles.iconButton, className].filter(Boolean).join(" ")}
      {...props}
    >
      {icon}
    </Button>
  );
}
