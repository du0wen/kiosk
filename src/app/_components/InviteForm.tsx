"use client";
import { useState } from "react";
import { authClient } from "@/lib/auth-client";

export function InviteForm() {
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<"member" | "admin">("member");
  const [link, setLink] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function invite() {
    setError(null);
    setLink(null);
    const res = await authClient.organization.inviteMember({ email, role });
    if (res.error || !res.data) {
      setError(res.error?.message ?? "Failed");
      return;
    }
    setLink(`${window.location.origin}/invite/${res.data.id}`);
    setEmail("");
  }

  return (
    <div style={{ marginTop: 16, display: "grid", gap: 8 }}>
      <h2 style={{ fontSize: 15 }}>Invite a member</h2>
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
        <input
          placeholder="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
        <select
          value={role}
          onChange={(e) => setRole(e.target.value as "member" | "admin")}
        >
          <option value="member">member</option>
          <option value="admin">admin</option>
        </select>
        <button onClick={invite}>Create invite link</button>
      </div>
      {link && (
        <p style={{ fontSize: 13 }}>
          Share this link: <code>{link}</code>
        </p>
      )}
      {error && <span style={{ color: "crimson" }}>{error}</span>}
    </div>
  );
}
