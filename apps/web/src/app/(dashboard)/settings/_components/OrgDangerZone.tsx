"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Button, Notice, Select, TextField } from "@/components/ui";

export function OrgDangerZone({
  organizationName,
  adminCandidates,
  onTransfer,
  onDelete,
}: {
  organizationName: string;
  adminCandidates: Array<{ userId: string; label: string }>;
  onTransfer: (targetUserId: string) => Promise<{ ok: boolean }>;
  onDelete: (confirmName: string) => Promise<{ ok: boolean; reason?: "mismatch" | "last_org" }>;
}) {
  const t = useTranslations("settings");
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [targetUserId, setTargetUserId] = useState(adminCandidates[0]?.userId ?? "");
  const [confirmName, setConfirmName] = useState("");
  const [feedback, setFeedback] = useState<
    "transferOwnerSuccess" | "saveFailed" | "deleteOrgConfirmMismatch" | "deleteOrgLastError" | null
  >(null);

  function handleTransfer() {
    if (!targetUserId) return;
    startTransition(async () => {
      const res = await onTransfer(targetUserId);
      setFeedback(res.ok ? "transferOwnerSuccess" : "saveFailed");
      if (res.ok) router.refresh();
    });
  }

  function handleDelete(e: React.FormEvent) {
    e.preventDefault();
    startTransition(async () => {
      const res = await onDelete(confirmName);
      if (res.ok) {
        window.location.assign("/pages");
        return;
      }
      if (res.reason === "mismatch") setFeedback("deleteOrgConfirmMismatch");
      else if (res.reason === "last_org") setFeedback("deleteOrgLastError");
      else setFeedback("saveFailed");
    });
  }

  return (
    <div style={{ display: "grid", gap: "1.25rem", maxWidth: "36rem" }}>
      {feedback && (
        <Notice tone={feedback === "transferOwnerSuccess" ? "success" : "danger"}>
          {t(feedback)}
        </Notice>
      )}

      <div style={{ display: "grid", gap: "0.75rem" }}>
        {adminCandidates.length > 0 ? (
          <>
            <Select
              label={t("transferOwnerLabel")}
              value={targetUserId}
              options={adminCandidates.map((c) => ({ value: c.userId, label: c.label }))}
              disabled={pending}
              onValueChange={setTargetUserId}
            />
            <div>
              <Button
                type="button"
                variant="secondary"
                disabled={pending || !targetUserId}
                onClick={handleTransfer}
              >
                {t("transferOwnerButton")}
              </Button>
            </div>
          </>
        ) : (
          <p style={{ margin: 0, fontSize: "0.875rem", color: "var(--text-secondary)" }}>
            {t("transferOwnerNone")}
          </p>
        )}
      </div>

      <form
        onSubmit={handleDelete}
        style={{
          display: "grid",
          gap: "0.75rem",
          paddingTop: "1rem",
          borderTop: "1px solid var(--border-default)",
        }}
      >
        <TextField
          name="confirmOrgName"
          label={t("deleteOrgLabel")}
          value={confirmName}
          placeholder={organizationName}
          disabled={pending}
          onChange={(e) => setConfirmName(e.target.value)}
          required
        />
        <div>
          <Button
            type="submit"
            variant="danger"
            disabled={pending || confirmName.trim() !== organizationName}
          >
            {t("deleteOrgButton")}
          </Button>
        </div>
      </form>
    </div>
  );
}
