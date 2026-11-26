"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Button, Notice } from "@/components/ui";

export function OrgSecurityForm({
  initialAllowPublicPages,
  initialAllowMemberExport,
  canEdit,
  onSave,
}: {
  initialAllowPublicPages: boolean;
  initialAllowMemberExport: boolean;
  canEdit: boolean;
  onSave: (input: {
    allowPublicPages: boolean;
    allowMemberExport: boolean;
  }) => Promise<{ ok: boolean }>;
}) {
  const t = useTranslations("settings");
  const common = useTranslations("common");
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [allowPublicPages, setAllowPublicPages] = useState(initialAllowPublicPages);
  const [allowMemberExport, setAllowMemberExport] = useState(initialAllowMemberExport);
  const [status, setStatus] = useState<"idle" | "saved" | "error">("idle");

  function submit(e: React.FormEvent) {
    e.preventDefault();
    startTransition(async () => {
      const res = await onSave({ allowPublicPages, allowMemberExport });
      setStatus(res.ok ? "saved" : "error");
      if (res.ok) router.refresh();
    });
  }

  return (
    <form onSubmit={submit} style={{ display: "grid", gap: "0.9rem", maxWidth: "38rem" }}>
      <label style={{ display: "grid", gap: "0.25rem", cursor: canEdit ? "pointer" : "default" }}>
        <span style={{ display: "flex", alignItems: "center", gap: "0.5rem", fontWeight: 500 }}>
          <input
            type="checkbox"
            checked={allowPublicPages}
            disabled={!canEdit || pending}
            onChange={(e) => setAllowPublicPages(e.target.checked)}
          />
          <span>{t("allowPublicPages")}</span>
        </span>
        <span style={{ fontSize: "0.825rem", color: "var(--text-secondary)" }}>
          {t("allowPublicPagesHelp")}
        </span>
      </label>

      <label style={{ display: "grid", gap: "0.25rem", cursor: canEdit ? "pointer" : "default" }}>
        <span style={{ display: "flex", alignItems: "center", gap: "0.5rem", fontWeight: 500 }}>
          <input
            type="checkbox"
            checked={allowMemberExport}
            disabled={!canEdit || pending}
            onChange={(e) => setAllowMemberExport(e.target.checked)}
          />
          <span>{t("allowMemberExport")}</span>
        </span>
        <span style={{ fontSize: "0.825rem", color: "var(--text-secondary)" }}>
          {t("allowMemberExportHelp")}
        </span>
      </label>

      {status === "saved" && <Notice tone="success">{t("saved")}</Notice>}
      {status === "error" && <Notice tone="danger">{t("saveFailed")}</Notice>}

      {canEdit && (
        <div>
          <Button type="submit" variant="primary" disabled={pending}>
            {common("save")}
          </Button>
        </div>
      )}
    </form>
  );
}
