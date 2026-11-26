"use client";
import { useRef } from "react";
import type { Route } from "next";
import { useRouter } from "next/navigation";
import { Search, X } from "lucide-react";
import { useTranslations } from "next-intl";
import { Button, Select } from "@/components/ui";
import { pagesHref, type PageListParams, type Sort, type Visibility } from "../_lib/list-params";
import styles from "./PagesToolbar.module.css";

/**
 * Unified pages filter toolbar. All state lives in the URL (so refresh/back
 * restore it); any change reads the whole form and pushes a fresh href with
 * `page` reset to 1. The three filters use the shared custom Select (listbox
 * popover), each backed by a hidden input so the existing FormData/URL logic is
 * unchanged.
 */
export function PagesToolbar({ params, owners }: { params: PageListParams; owners: { id: string; label: string }[] }) {
  const t = useTranslations("pages");
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const submit = () => {
    const form = formRef.current;
    if (!form) return;
    const f = new FormData(form);
    router.push(
      pagesHref({
        q: String(f.get("q") ?? "").trim(),
        visibility: String(f.get("visibility")) as Visibility,
        owner: String(f.get("owner")),
        sort: String(f.get("sort")) as Sort,
        page: 1,
      }) as Route,
    );
  };
  return (
    <form ref={formRef} className={styles.toolbar} role="search" onSubmit={(e) => { e.preventDefault(); submit(); }}>
      <label className={styles.searchField}>
        <Search size={16} aria-hidden="true" />
        <input name="q" defaultValue={params.q} aria-label={t("searchLabel")} placeholder={t("searchLabel")} />
      </label>
      <Select
        className={styles.filter}
        name="visibility"
        label={t("filterVisibility")}
        value={params.visibility}
        onValueChange={submit}
        options={[
          { value: "all", label: t("visibilityAll") },
          { value: "public", label: t("public") },
          { value: "org", label: t("private") },
        ]}
      />
      <Select
        className={styles.filter}
        name="owner"
        label={t("filterOwner")}
        value={params.owner}
        onValueChange={submit}
        options={[
          { value: "all", label: t("ownerAll") },
          { value: "me", label: t("ownerMe") },
          ...owners.map((owner) => ({ value: owner.id, label: owner.label })),
        ]}
      />
      <Select
        className={styles.filter}
        name="sort"
        label={t("filterSort")}
        value={params.sort}
        onValueChange={submit}
        options={[
          { value: "updated_desc", label: t("sortUpdatedDesc") },
          { value: "updated_asc", label: t("sortUpdatedAsc") },
          { value: "views_desc", label: t("sortViewsDesc") },
          { value: "title_asc", label: t("sortTitleAsc") },
        ]}
      />
      <div className={styles.buttons}>
        <Button type="submit" variant="secondary"><Search size={15} />{t("searchButton")}</Button>
        <Button type="button" variant="ghost" onClick={() => router.push("/pages")}><X size={15} />{t("clearFilters")}</Button>
      </div>
    </form>
  );
}
