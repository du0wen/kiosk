import { forwardRef, useId, type InputHTMLAttributes, type TextareaHTMLAttributes } from "react";
import styles from "./Field.module.css";

type FieldChrome = {
  label: string;
  help?: string;
  error?: string;
};

export const TextField = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement> & FieldChrome>(
  function TextField({ label, help, error, id, className, ...props }, ref) {
    const generated = useId();
    const inputId = id ?? generated;
    const descriptionId = `${inputId}-description`;
    return (
      <label className={styles.field} htmlFor={inputId}>
        <span className={styles.label}>{label}</span>
        <input
          ref={ref}
          id={inputId}
          className={[styles.input, error && styles.invalid, className].filter(Boolean).join(" ")}
          aria-invalid={!!error}
          aria-describedby={help || error ? descriptionId : undefined}
          {...props}
        />
        {(error || help) && <span id={descriptionId} className={error ? styles.error : styles.help}>{error ?? help}</span>}
      </label>
    );
  },
);

export function ColorField(props: InputHTMLAttributes<HTMLInputElement> & FieldChrome) {
  return <TextField type="color" {...props} />;
}

export const TextAreaField = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement> & FieldChrome>(
  function TextAreaField({ label, help, error, id, className, ...props }, ref) {
    const generated = useId();
    const inputId = id ?? generated;
    const descriptionId = `${inputId}-description`;
    return <label className={styles.field} htmlFor={inputId}><span className={styles.label}>{label}</span><textarea ref={ref} id={inputId} className={[styles.input, styles.textarea, error && styles.invalid, className].filter(Boolean).join(" ")} aria-invalid={!!error} aria-describedby={help || error ? descriptionId : undefined} {...props} />{(error || help) && <span id={descriptionId} className={error ? styles.error : styles.help}>{error ?? help}</span>}</label>;
  },
);
