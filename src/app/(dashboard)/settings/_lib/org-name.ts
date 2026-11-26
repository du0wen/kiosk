export type OrgNameResult = { ok: true; name: string } | { ok: false };

/** Server + client shared org-name rule: trimmed, non-empty, at most 80 chars. */
export function validateOrgName(raw: string): OrgNameResult {
  const name = raw.trim();
  if (!name || name.length > 80) return { ok: false };
  return { ok: true, name };
}
