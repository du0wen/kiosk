"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui";

export function SignupPolicyForm({
  initialAllowed,
}: {
  initialAllowed: boolean;
}) {
  const t = useTranslations("settings");
  const [allowed, setAllowed] = useState(initialAllowed);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<"idle" | "saved" | "error">("idle");

  async function onToggle(nextValue: boolean) {
    setSaving(true);
    setStatus("idle");
    try {
      const res = await fetch("/api/admin/signup-policy", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ allowPublicSignup: nextValue }),
      });
      if (!res.ok) throw new Error("Failed");
      const data = (await res.json()) as { allowPublicSignup: boolean };
      setAllowed(data.allowPublicSignup);
      setStatus("saved");
    } catch {
      setStatus("error");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div style={{ display: "grid", gap: "0.75rem", maxWidth: "36rem" }}>
      <label
        style={{
          display: "flex",
          alignItems: "center",
          gap: "0.625rem",
          fontWeight: 500,
          cursor: saving ? "wait" : "pointer",
        }}
      >
        <input
          type="checkbox"
          checked={allowed}
          disabled={saving}
          onChange={(e) => void onToggle(e.target.checked)}
        />
        <span>{t("allowPublicSignup")}</span>
      </label>
      <p style={{ margin: 0, fontSize: "0.875rem", color: "var(--text-secondary)" }}>
        {t("allowPublicSignupHelp")}
      </p>
      <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
        <Button
          type="button"
          variant="secondary"
          disabled={saving}
          onClick={() => void onToggle(!allowed)}
        >
          {allowed ? t("switchToInviteOnly") : t("enablePublicSignup")}
        </Button>
        {status === "saved" && (
          <span style={{ fontSize: "0.875rem", color: "var(--text-success, #15803d)" }}>
            {t("saved")}
          </span>
        )}
        {status === "error" && (
          <span style={{ fontSize: "0.875rem", color: "var(--text-danger, #b91c1c)" }}>
            {t("saveFailed")}
          </span>
        )}
      </div>
    </div>
  );
}
