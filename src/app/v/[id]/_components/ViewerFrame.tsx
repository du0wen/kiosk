"use client";
import { useEffect, useReducer, useRef, useState } from "react";
import { ArrowLeft, ExternalLink, Flag, Loader2, RotateCw, ShieldAlert, X } from "lucide-react";
import { useTranslations } from "next-intl";
import { viewerReducer, VIEWER_LOAD_TIMEOUT_MS } from "../_lib/viewer-state";
import { buildWatermarkSvgDataUri } from "@/lib/watermark";
import styles from "./ViewerFrame.module.css";

export function ViewerFrame({
  src,
  rawUrl,
  reportHref,
  consoleHref,
  brandName,
  accent,
  title,
  watermark,
  hideRawLink = false,
}: {
  src: string;
  rawUrl: string;
  reportHref: string;
  consoleHref: string;
  brandName: string;
  accent: string;
  title: string;
  watermark?: { label: string; opacity: number };
  hideRawLink?: boolean;
}) {
  const t = useTranslations("viewer");
  const [status, dispatch] = useReducer(viewerReducer, "loading");
  const [attempt, setAttempt] = useState(0);
  const [dismissed, setDismissed] = useState(false);
  const [wmNonce, setWmNonce] = useState(0);
  const shellRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const watermarkRef = useRef<HTMLDivElement>(null);

  const watermarkUrl = watermark
    ? buildWatermarkSvgDataUri(watermark.label, watermark.opacity)
    : null;

  // Lightweight tamper resilience: re-mount the overlay if removed/hidden via DevTools.
  useEffect(() => {
    if (!watermarkUrl || !stageRef.current) return;
    const stage = stageRef.current;
    const observer = new MutationObserver(() => {
      const node = watermarkRef.current;
      if (!node || !stage.contains(node) || node.style.display === "none" || node.style.opacity === "0") {
        setWmNonce((n) => n + 1);
      }
    });
    observer.observe(stage, { childList: true, subtree: true, attributes: true, attributeFilter: ["style", "class"] });
    return () => observer.disconnect();
  }, [watermarkUrl, wmNonce]);

  // Inject the org's dynamic accent as a CSS variable the module consumes.
  useEffect(() => {
    shellRef.current?.style.setProperty("--viewer-accent", accent);
  }, [accent]);

  // Cross-origin sandboxed frames give us no content signal, so a timeout is
  // the only way to surface an unreachable serving origin instead of a blank.
  useEffect(() => {
    if (status !== "loading") return;
    const timer = window.setTimeout(() => dispatch("timeout"), VIEWER_LOAD_TIMEOUT_MS);
    return () => window.clearTimeout(timer);
  }, [status, attempt]);

  const retry = () => {
    setAttempt((value) => value + 1);
    dispatch("retry");
  };

  return (
    <div ref={shellRef} className={styles.shell}>
      <header className={styles.bar}>
        <strong className={styles.brand}>{brandName}</strong>
        <span className={styles.title}>{title}</span>
        <nav className={styles.actions}>
          {!hideRawLink && (
            <a href={rawUrl} target="_blank" rel="noreferrer" aria-label={t("openRaw")} title={t("openRaw")}>
              <ExternalLink size={15} aria-hidden="true" />
              <span className={styles.label}>{t("openRaw")}</span>
            </a>
          )}
          <a href={reportHref} aria-label={t("report")} title={t("report")}>
            <Flag size={15} aria-hidden="true" />
            <span className={styles.label}>{t("report")}</span>
          </a>
          <a href={consoleHref} aria-label={t("backToConsole")} title={t("backToConsole")}>
            <ArrowLeft size={15} aria-hidden="true" />
            <span className={styles.label}>{t("backToConsole")}</span>
          </a>
        </nav>
      </header>
      {!dismissed && (
        <aside className={styles.disclaimer} role="status" aria-label={t("disclaimer")}>
          <div className={styles.disclaimerContent}>
            <ShieldAlert size={14} className={styles.disclaimerIcon} aria-hidden="true" />
            <span>{t("disclaimer")}</span>
          </div>
          <button
            type="button"
            className={styles.disclaimerDismiss}
            onClick={() => setDismissed(true)}
            aria-label={t("dismissDisclaimer")}
          >
            <X size={14} aria-hidden="true" />
            <span className={styles.disclaimerDismissText}>{t("dismissDisclaimer")}</span>
          </button>
        </aside>
      )}
      <div ref={stageRef} className={styles.stage}>
        <iframe
          key={attempt}
          src={src}
          sandbox="allow-scripts"
          title={title}
          className={styles.frame}
          onLoad={() => dispatch("loaded")}
          onError={() => dispatch("errored")}
        />
        {watermarkUrl && (
          <div
            key={wmNonce}
            ref={watermarkRef}
            className={styles.watermarkLayer}
            style={{ backgroundImage: `url("${watermarkUrl}")` }}
            aria-hidden="true"
            data-testid="fullpage-watermark"
          />
        )}
        {status === "loading" && (
          <div className={styles.overlay} role="status" aria-live="polite">
            <Loader2 className={styles.spinner} size={24} aria-hidden="true" />
            <p>{t("loading")}</p>
          </div>
        )}
        {status === "error" && (
          <div className={styles.overlay} role="alert">
            <h1>{t("errorTitle")}</h1>
            <p>{t("errorBody")}</p>
            <div className={styles.errorActions}>
              <button type="button" className={styles.primary} onClick={retry}>
                <RotateCw size={15} aria-hidden="true" />
                {t("retry")}
              </button>
              <a href={rawUrl} target="_blank" rel="noreferrer">
                <ExternalLink size={15} aria-hidden="true" />
                {t("openRaw")}
              </a>
              <a href={consoleHref}>
                <ArrowLeft size={15} aria-hidden="true" />
                {t("backToConsole")}
              </a>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
