"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { authClient } from "@/lib/auth-client";

type Props = {
  memberId: string;
  email: string;
  role: string;
  manage: boolean;
  isSelf: boolean;
};

export function MemberRow({ memberId, email, role, manage, isSelf }: Props) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function setRole(next: string) {
    setBusy(true);
    await authClient.organization.updateMemberRole({ memberId, role: next });
    setBusy(false);
    router.refresh();
  }
  async function remove() {
    setBusy(true);
    await authClient.organization.removeMember({ memberIdOrEmail: memberId });
    setBusy(false);
    router.refresh();
  }

  return (
    <li
      style={{
        border: "1px solid #8883",
        borderRadius: 8,
        padding: 10,
        display: "flex",
        gap: 10,
        alignItems: "center",
      }}
    >
      <strong>{email}</strong>
      {manage && role !== "owner" && !isSelf ? (
        <>
          <select
            value={role}
            disabled={busy}
            onChange={(e) => setRole(e.target.value)}
          >
            <option value="member">member</option>
            <option value="admin">admin</option>
          </select>
          <button disabled={busy} onClick={remove} style={{ marginLeft: "auto" }}>
            Remove
          </button>
        </>
      ) : (
        <span style={{ opacity: 0.7 }}>{role}</span>
      )}
    </li>
  );
}
