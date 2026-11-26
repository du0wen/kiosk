"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Check, ExternalLink, Flag } from "lucide-react";
import { useTranslations } from "next-intl";
import { Badge, Button, Notice, Select, TextField } from "@/components/ui";
import {
  buildWatermarkSvgDataUri,
  type WatermarkMode,
  type WatermarkScope,
} from "@/lib/watermark";
import { isReadableAccent } from "../_lib/contrast";
import styles from "./BrandingForm.module.css";

export type BrandingState = { ok: boolean | null; error?: "forbidden" | "failed" };
type Action = (prev: BrandingState, formData: FormData) => Promise<BrandingState>;

export function BrandingForm({
  initialColor,
  initialWatermark,
  initialWatermarkMode = "footer",
  initialWatermarkScope = "org_only",
  initialIncludeViewer = false,
  initialOpacity = 8,
  organizationName,
  canEdit,
  action,
}: {
  initialColor: string;
  initialWatermark: string;
  initialWatermarkMode?: WatermarkMode;
  initialWatermarkScope?: WatermarkScope;
  initialIncludeViewer?: boolean;
  initialOpacity?: number;
  organizationName: string;
  canEdit: boolean;
  action: Action;
}) {
  const t = useTranslations("branding");
  const viewer = useTranslations("viewer");
  const pages = useTranslations("pages");
  const router = useRouter();
  const [color, setColor] = useState(initialColor);
  const [watermark, setWatermark] = useState(initialWatermark);
  const [watermarkMode, setWatermarkMode] = useState<WatermarkMode>(initialWatermarkMode);
  const [watermarkScope, setWatermarkScope] = useState<WatermarkScope>(initialWatermarkScope);
  const [includeViewer, setIncludeViewer] = useState(initialIncludeViewer);
  const [opacity, setOpacity] = useState(initialOpacity);
  const [state, formAction, pending] = useActionState<BrandingState, FormData>(action, { ok: null });
  const layoutRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    layoutRef.current?.style.setProperty("--preview-accent", color);
  }, [color]);
  useEffect(() => {
    if (state.ok) router.refresh();
  }, [state.ok, router]);

  const lowContrast = !isReadableAccent(color);
  const errorText =
    state.error === "forbidden"
      ? t("readOnly")
      : state.error === "failed"
        ? t("saveFailed")
        : null;

  const previewLabel = [
    watermark.trim() || organizationName,
    ...(includeViewer ? ["user@company.com", "2026-11-25"] : []),
  ].join(" · ");

  const previewWatermarkUri =
    watermarkMode === "fullpage"
      ? buildWatermarkSvgDataUri(previewLabel, opacity / 100)
      : null;

  return (
    <div ref={layoutRef} className={styles.layout}>
      <section className={styles.formSection}>
        {canEdit ? (
          <form action={formAction} className={styles.form}>
            <label className={styles.colorField}>
              <span>{t("accentColor")}</span>
              <span className={styles.colorControl}>
                <input
                  type="color"
                  name="themeColor"
                  value={color}
                  aria-label={t("accentColor")}
                  onChange={(event) => setColor(event.target.value)}
                />
                <code>{color.toUpperCase()}</code>
              </span>
              <small>{t("accentHelp")}</small>
            </label>
            {lowContrast && <Notice tone="warning">{t("contrastWarning")}</Notice>}

            <Select
              name="watermarkMode"
              label={t("watermarkMode")}
              value={watermarkMode}
              options={[
                { value: "off", label: t("watermarkMode_off") },
                { value: "footer", label: t("watermarkMode_footer") },
                { value: "fullpage", label: t("watermarkMode_fullpage") },
              ]}
              onValueChange={(v) => setWatermarkMode(v as WatermarkMode)}
            />

            {watermarkMode !== "off" && (
              <>
                <Select
                  name="watermarkScope"
                  label={t("watermarkScopeLabel")}
                  value={watermarkScope}
                  options={[
                    { value: "org_only", label: t("watermarkScope_org_only") },
                    { value: "all", label: t("watermarkScope_all") },
                  ]}
                  onValueChange={(v) => setWatermarkScope(v as WatermarkScope)}
                />
                <TextField
                  name="exportWatermark"
                  label={t("watermark")}
                  value={watermark}
                  placeholder={t("watermarkPlaceholder")}
                  help={t("watermarkHelp")}
                  maxLength={120}
                  onChange={(event) => setWatermark(event.target.value)}
                />
                <label
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "0.5rem",
                    fontSize: "0.875rem",
                    cursor: "pointer",
                  }}
                >
                  <input
                    type="checkbox"
                    name="watermarkIncludeViewer"
                    checked={includeViewer}
                    onChange={(e) => setIncludeViewer(e.target.checked)}
                  />
                  <span>{t("watermarkIncludeViewer")}</span>
                </label>
                {watermarkMode === "fullpage" && (
                  <label style={{ display: "grid", gap: "0.35rem", fontSize: "0.875rem" }}>
                    <span>{t("watermarkOpacity", { percent: opacity })}</span>
                    <input
                      type="range"
                      name="watermarkOpacity"
                      min={4}
                      max={25}
                      value={opacity}
                      onChange={(e) => setOpacity(Number(e.target.value))}
                    />
                  </label>
                )}
              </>
            )}

            {state.ok === true && <Notice tone="success">{t("saved")}</Notice>}
            {errorText && <Notice tone="danger">{errorText}</Notice>}
            <Button variant="primary" type="submit" loading={pending}>
              <Check size={16} />
              {t("save")}
            </Button>
          </form>
        ) : (
          <Notice tone="info">{t("readOnly")}</Notice>
        )}
      </section>

      <section className={styles.preview}>
        <div className={styles.previewHeader}>
          <span>{t("preview")}</span>
          <span className={styles.windowControls}>
            <i />
            <i />
            <i />
          </span>
        </div>
        <div className={styles.shellPreview}>
          <header className={styles.shellBar}>
            <strong className={styles.brandName}>{organizationName}</strong>
            <span className={styles.sampleTitle}>{t("sampleTitle")}</span>
            <span className={styles.shellLinks}>
              {watermarkMode !== "fullpage" && (
                <span>
                  <ExternalLink size={13} aria-hidden="true" />
                  {viewer("openRaw")}
                </span>
              )}
              <span>
                <Flag size={13} aria-hidden="true" />
                {viewer("report")}
              </span>
            </span>
          </header>
          <div className={styles.frame} style={{ position: "relative", overflow: "hidden" }}>
            <Badge tone="success">
              {watermarkScope === "org_only" ? pages("org") : pages("public")}
            </Badge>
            <div className={styles.previewLines}>
              <i />
              <i />
              <i />
            </div>
            {previewWatermarkUri && (
              <div
                aria-hidden="true"
                style={{
                  position: "absolute",
                  inset: 0,
                  pointerEvents: "none",
                  backgroundRepeat: "repeat",
                  backgroundImage: `url("${previewWatermarkUri}")`,
                }}
              />
            )}
          </div>
          <div className={styles.exportStrip}>
            <span className={styles.exportLabel}>
              {watermarkMode === "fullpage"
                ? t("watermarkFullpageHint")
                : t("watermarkScope")}
            </span>
            {watermarkMode !== "off" && (
              <span className={styles.watermarkChip}>
                {previewLabel || t("watermarkPlaceholder")}
              </span>
            )}
          </div>
        </div>
      </section>
    </div>
  );
}
