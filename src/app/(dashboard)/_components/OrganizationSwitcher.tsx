"use client";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";
import { useTranslations } from "next-intl";
import { authClient } from "@/lib/auth-client";
import { Button, Dialog, IconButton, Notice, TextField } from "@/components/ui";
import { SidebarDropdown } from "./SidebarDropdown";
import styles from "./OrganizationSwitcher.module.css";

type Org = { id: string; name: string };

// The active org's name comes fresh from the server layout; a stale list entry
// (async `organization.list`) must not overwrite it, so the active entry wins.
export function mergeOrganizations(organizations: Org[], active: Org): Org[] {
  const unique = new Map<string, Org>([[active.id, active]]);
  for (const organization of organizations) if (!unique.has(organization.id)) unique.set(organization.id, organization);
  return [...unique.values()];
}

export function OrganizationSwitcher({ activeOrganizationId, organizationName, resetSignal }: { activeOrganizationId: string; organizationName: string; resetSignal?: boolean }) {
  const router = useRouter();
  const t = useTranslations("shell");
  const common = useTranslations("common");
  const active = useMemo(() => ({ id: activeOrganizationId, name: organizationName }), [activeOrganizationId, organizationName]);
  const [organizations, setOrganizations] = useState<Org[]>([active]);
  const [pendingOrganization, setPendingOrganization] = useState<Org | null>(null);
  const [loadingOrganizations, setLoadingOrganizations] = useState(true);
  const [createOpen, setCreateOpen] = useState(false);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let current = true;
    authClient.organization.list().then((result) => {
      if (!current) return;
      setOrganizations((result.data as Org[]) ?? []);
      setLoadingOrganizations(false);
    });
    return () => { current = false; };
  }, []);

  const availableOrganizations = mergeOrganizations(organizations, active);
  const optimisticOrganization = pendingOrganization?.id === activeOrganizationId ? null : pendingOrganization;
  const selected = optimisticOrganization ?? active;
  const switching = optimisticOrganization !== null;

  const switchOrganization = async (organizationId: string) => {
    if (organizationId === selected.id) return;
    const nextOrganization = availableOrganizations.find((organization) => organization.id === organizationId);
    if (!nextOrganization) return;
    setPendingOrganization(nextOrganization);
    setError(null);
    const result = await authClient.organization.setActive({ organizationId });
    if (result.error) {
      setPendingOrganization(null);
      setError(result.error.message ?? common("unknown"));
      return;
    }
    router.refresh();
  };

  const createOrganization = async () => {
    if (!name.trim()) return;
    setBusy(true);
    setError(null);
    const result = await authClient.organization.create({ name: name.trim(), slug: `o-${crypto.randomUUID().slice(0, 8)}` });
    if (result.error || !result.data) {
      setError(result.error?.message ?? common("unknown"));
      setBusy(false);
      return;
    }
    const created = result.data as Org;
    setOrganizations((current) => mergeOrganizations(current, created));
    setPendingOrganization(created);
    const activation = await authClient.organization.setActive({ organizationId: created.id });
    if (activation.error) {
      setPendingOrganization(null);
      setError(activation.error.message ?? common("unknown"));
      setBusy(false);
      return;
    }
    setCreateOpen(false);
    setName("");
    setBusy(false);
    router.refresh();
  };

  const selectBusy = loadingOrganizations || switching || busy;

  return <div className={styles.wrapper} aria-busy={selectBusy}>
    <SidebarDropdown
      label={t("organization")}
      value={selected.id}
      options={availableOrganizations.map((organization) => ({ value: organization.id, label: organization.name }))}
      disabled={selectBusy}
      busy={selectBusy}
      placement="bottom"
      triggerClassName={styles.switcher}
      popoverClassName={styles.popover}
      resetSignal={resetSignal}
      onChange={switchOrganization}
    >
      <span className={styles.avatar}>{selected.name.slice(0, 2).toUpperCase()}</span>
      <span className={styles.meta}><strong>{selected.name}</strong><small>{t("organization")}</small></span>
    </SidebarDropdown>
    <IconButton className={styles.createButton} label={t("createOrganization")} icon={<Plus size={16} />} onClick={() => setCreateOpen(true)} />
    <Dialog open={createOpen} title={t("createOrganization")} closeLabel={common("close")} onClose={() => setCreateOpen(false)} footer={<><Button onClick={() => setCreateOpen(false)}>{common("cancel")}</Button><Button variant="primary" loading={busy} onClick={createOrganization}>{common("create")}</Button></>}>
      <div className={styles.createForm}><TextField label={t("organizationName")} value={name} required maxLength={80} autoFocus onChange={(event) => setName(event.target.value)} />{error && <Notice tone="danger">{error}</Notice>}</div>
    </Dialog>
  </div>;
}
