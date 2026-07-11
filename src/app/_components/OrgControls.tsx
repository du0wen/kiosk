"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { authClient } from "@/lib/auth-client";

type Org = { id: string; name: string };

export function OrgControls() {
  const router = useRouter();
  const [orgs, setOrgs] = useState<Org[]>([]);
  const [name, setName] = useState("");

  useEffect(() => {
    authClient.organization.list().then((r) => setOrgs((r.data as Org[]) ?? []));
  }, []);

  async function switchOrg(id: string) {
    await authClient.organization.setActive({ organizationId: id });
    router.refresh();
  }
  async function create() {
    if (!name.trim()) return;
    const slug = `o-${Math.random().toString(36).slice(2, 10)}`;
    const r = await authClient.organization.create({ name, slug });
    if (r.data) {
      await authClient.organization.setActive({
        organizationId: (r.data as Org).id,
      });
      setName("");
      router.refresh();
    }
  }

  return (
    <div
      style={{
        display: "flex",
        gap: 8,
        alignItems: "center",
        flexWrap: "wrap",
        margin: "8px 0 16px",
      }}
    >
      {orgs.length > 1 && (
        <select onChange={(e) => switchOrg(e.target.value)}>
          {orgs.map((o) => (
            <option key={o.id} value={o.id}>
              {o.name}
            </option>
          ))}
        </select>
      )}
      <input
        placeholder="New org name"
        value={name}
        onChange={(e) => setName(e.target.value)}
      />
      <button onClick={create}>Create org</button>
    </div>
  );
}
