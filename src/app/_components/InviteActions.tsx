"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { authClient } from "@/lib/auth-client";

export function InviteActions({ invitationId }: { invitationId: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function act(kind: "accept" | "reject") {
    setBusy(true);
    setError(null);
    const res =
      kind === "accept"
        ? await authClient.organization.acceptInvitation({ invitationId })
        : await authClient.organization.rejectInvitation({ invitationId });
    if (res.error) {
      setError(res.error.message ?? "Failed");
      setBusy(false);
      return;
    }
    router.push("/pages");
  }

  return (
    <div style={{ display: "flex", gap: 8, marginTop: 12, alignItems: "center" }}>
      <button disabled={busy} onClick={() => act("accept")}>
        Accept
      </button>
      <button disabled={busy} onClick={() => act("reject")}>
        Decline
      </button>
      {error && <span style={{ color: "crimson" }}>{error}</span>}
    </div>
  );
}
