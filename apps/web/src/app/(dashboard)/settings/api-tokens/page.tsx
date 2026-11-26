import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { getTranslations } from "next-intl/server";
import { getSession } from "@/lib/session";
import { resolveActiveOrg } from "@/lib/console";
import { createToken, listTokens, revokeToken } from "@/lib/token";
import { tokenExpiresAt } from "@/lib/token";
import { effectiveTokenScopes, normalizeTokenScopes } from "@/lib/token-scopes";
import { QuotaExceededError } from "@/lib/quota";
import { PageSection } from "../../_components/PageHeader";
import { SettingsLayout } from "../_components/SettingsLayout";
import { TokensClient, type TokenCreateState } from "./_components/TokensClient";

export default async function SettingsTokensPage() {
  const session = await getSession();
  if (!session) redirect("/sign-in?callback=/settings/api-tokens");
  const org = await resolveActiveOrg(session);
  if (!org) redirect("/sign-in");
  const t = await getTranslations("tokens");
  const tokens = await listTokens(org);

  // The plaintext is returned in the action *result* (shown once by the client)
  // — never redirected/queried into the URL.
  async function create(formData: FormData): Promise<TokenCreateState> {
    "use server";
    const s = await getSession();
    const o = s && (await resolveActiveOrg(s));
    if (!o || !s) return { ok: false, error: "failed" };
    try {
      const scopes = normalizeTokenScopes(
        formData.getAll("scopes").map(String),
      );
      const expiryValue = String(formData.get("expiresInDays") ?? "90");
      if (!["30", "90", "365", "never"].includes(expiryValue)) {
        return { ok: false, error: "invalid" };
      }
      const { plaintext } = await createToken({
        userId: s.user.id,
        organizationId: o,
        name: String(formData.get("name") || "token"),
        scopes,
        expiresAt:
          expiryValue === "never" ? null : tokenExpiresAt(Number(expiryValue)),
      });
      revalidatePath("/settings/api-tokens");
      return { ok: true, token: plaintext };
    } catch (error) {
      if (error instanceof QuotaExceededError) {
        return { ok: false, error: "quota" };
      }
      return { ok: false, error: "failed" };
    }
  }
  async function revoke(formData: FormData) {
    "use server";
    const s = await getSession();
    const o = s && (await resolveActiveOrg(s));
    if (!o) return;
    await revokeToken(String(formData.get("id")), o);
    revalidatePath("/settings/api-tokens");
  }

  return (
    <SettingsLayout>
      <PageSection title={t("title")} description={t("subtitle")}>
        <TokensClient createAction={create} revokeAction={revoke} tokens={tokens.map((token) => ({ id: token.id, name: token.name, tokenFingerprint: token.tokenFingerprint, scopes: effectiveTokenScopes(token.scopes), expiresAt: token.expiresAt?.toISOString() ?? null, createdAt: token.createdAt.toISOString(), lastUsedAt: token.lastUsedAt?.toISOString() ?? null, revokedAt: token.revokedAt?.toISOString() ?? null, creator: token.creatorName || token.creatorEmail || token.createdBy }))} />
      </PageSection>
    </SettingsLayout>
  );
}
