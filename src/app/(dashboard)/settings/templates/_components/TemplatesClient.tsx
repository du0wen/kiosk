"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import {
  Badge,
  Button,
  Notice,
  Select,
  TextAreaField,
  TextField,
} from "@/components/ui";
import {
  TEMPLATE_CATEGORIES,
  type TemplateCategory,
} from "@/lib/template-categories";

export type TemplateItemView = {
  id: string;
  slug: string;
  name: string;
  category: TemplateCategory;
  description: string;
  promptGuidelines: string;
  html: string;
  currentVersion: number;
  isDefault: boolean;
  updatedAt: string;
  versions: Array<{
    versionNumber: number;
    changeNote: string;
    createdAt: string;
  }>;
};

type FeedbackKey =
  | "saved"
  | "restored"
  | "deleted"
  | "startersImported"
  | "copiedCli"
  | "actionFailed"
  | null;

const SAMPLE_PREVIEW_BODY =
  "<section><h2>Executive Summary</h2><p>This is a live preview of your organization template with sample content, metrics, and table formatting.</p><table><thead><tr><th>Metric</th><th>Current</th><th>Delta</th></tr></thead><tbody><tr><td>Active Users</td><td>12,480</td><td>+18.4%</td></tr><tr><td>Published Pages</td><td>1,924</td><td>+24.1%</td></tr></tbody></table></section>";

function renderPreviewHtml(rawHtml: string, title: string): string {
  let out = rawHtml.replace(/\{\{\s*TITLE\s*\}\}/g, title);
  if (/\{\{\s*CONTENT\s*\}\}/.test(out)) {
    out = out.replace(/\{\{\s*CONTENT\s*\}\}/g, SAMPLE_PREVIEW_BODY);
  }
  return out;
}

export function TemplatesClient({
  items,
  canManage,
  onSave,
  onImportStarters,
  onRestore,
  onDelete,
}: {
  items: TemplateItemView[];
  canManage: boolean;
  onSave: (input: {
    id?: string;
    slug: string;
    name: string;
    category: string;
    description: string;
    promptGuidelines: string;
    html: string;
    changeNote: string;
    isDefault: boolean;
  }) => Promise<{ ok: boolean }>;
  onImportStarters: () => Promise<{ ok: boolean }>;
  onRestore: (templateId: string, versionNumber: number) => Promise<{ ok: boolean }>;
  onDelete: (templateId: string) => Promise<{ ok: boolean }>;
}) {
  const t = useTranslations("templates");
  const common = useTranslations("common");
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const [categoryFilter, setCategoryFilter] = useState<string>("all");
  const [editing, setEditing] = useState<TemplateItemView | "new" | null>(null);
  const [historyFor, setHistoryFor] = useState<string | null>(null);
  const [previewFor, setPreviewFor] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<FeedbackKey>(null);

  // Editor form state
  const [slug, setSlug] = useState("");
  const [name, setName] = useState("");
  const [category, setCategory] = useState<TemplateCategory>("report");
  const [description, setDescription] = useState("");
  const [promptGuidelines, setPromptGuidelines] = useState("");
  const [html, setHtml] = useState("");
  const [changeNote, setChangeNote] = useState("");
  const [isDefault, setIsDefault] = useState(false);

  const visibleItems =
    categoryFilter === "all"
      ? items
      : items.filter((item) => item.category === categoryFilter);

  const categoryOptions = TEMPLATE_CATEGORIES.map((c) => ({
    value: c,
    label: t(`category_${c}` as Parameters<typeof t>[0]),
  }));

  function openNew() {
    setEditing("new");
    setSlug("");
    setName("");
    setCategory("report");
    setDescription("");
    setPromptGuidelines("");
    setHtml(
      "<!doctype html>\n<html>\n<head><meta charset=\"utf-8\" /><title>{{TITLE}}</title></head>\n<body>\n  {{CONTENT}}\n</body>\n</html>",
    );
    setChangeNote("");
    setIsDefault(false);
    setFeedback(null);
  }

  function openEdit(item: TemplateItemView) {
    setEditing(item);
    setSlug(item.slug);
    setName(item.name);
    setCategory(item.category);
    setDescription(item.description);
    setPromptGuidelines(item.promptGuidelines);
    setHtml(item.html);
    setChangeNote("");
    setIsDefault(item.isDefault);
    setFeedback(null);
  }

  function submitForm(e: React.FormEvent) {
    e.preventDefault();
    startTransition(async () => {
      const res = await onSave({
        id: editing && editing !== "new" ? editing.id : undefined,
        slug,
        name,
        category,
        description,
        promptGuidelines,
        html,
        changeNote,
        isDefault,
      });
      if (res.ok) {
        setEditing(null);
        setFeedback("saved");
        router.refresh();
      } else {
        setFeedback("actionFailed");
      }
    });
  }

  function handleImportStarters() {
    startTransition(async () => {
      const res = await onImportStarters();
      setFeedback(res.ok ? "startersImported" : "actionFailed");
      if (res.ok) router.refresh();
    });
  }

  function handleRestore(templateId: string, versionNumber: number) {
    startTransition(async () => {
      const res = await onRestore(templateId, versionNumber);
      setFeedback(res.ok ? "restored" : "actionFailed");
      if (res.ok) router.refresh();
    });
  }

  function handleDelete(templateId: string) {
    startTransition(async () => {
      const res = await onDelete(templateId);
      setFeedback(res.ok ? "deleted" : "actionFailed");
      if (res.ok) router.refresh();
    });
  }

  async function copyCliCommand(itemSlug: string) {
    try {
      await navigator.clipboard.writeText(`kiosk template get ${itemSlug}`);
      setFeedback("copiedCli");
    } catch {
      setFeedback("actionFailed");
    }
  }

  return (
    <div style={{ display: "grid", gap: "1rem" }}>
      {!canManage && <Notice tone="info">{t("readOnly")}</Notice>}
      {feedback && (
        <Notice tone={feedback === "actionFailed" ? "danger" : "success"}>
          {t(feedback)}
        </Notice>
      )}

      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          gap: "0.75rem",
          alignItems: "flex-end",
          justifyContent: "space-between",
        }}
      >
        <div style={{ minWidth: "13rem" }}>
          <Select
            label={t("category")}
            value={categoryFilter}
            options={[{ value: "all", label: t("allCategories") }, ...categoryOptions]}
            onValueChange={setCategoryFilter}
          />
        </div>
        {canManage && (
          <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
            <Button
              type="button"
              variant="secondary"
              disabled={pending}
              onClick={handleImportStarters}
            >
              {t("importStarters")}
            </Button>
            <Button type="button" variant="primary" disabled={pending} onClick={openNew}>
              {t("create")}
            </Button>
          </div>
        )}
      </div>

      {editing && canManage && (
        <form
          onSubmit={submitForm}
          style={{
            display: "grid",
            gap: "0.85rem",
            padding: "1.25rem",
            border: "1px solid var(--border-default)",
            borderRadius: "10px",
            background: "var(--surface-primary)",
          }}
        >
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.75rem" }}>
            <TextField
              name="name"
              label={t("name")}
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
            />
            <TextField
              name="slug"
              label={t("slug")}
              value={slug}
              disabled={editing !== "new"}
              onChange={(e) => setSlug(e.target.value)}
              required
            />
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.75rem" }}>
            <Select
              label={t("category")}
              value={category}
              options={categoryOptions}
              onValueChange={(v) => setCategory(v as TemplateCategory)}
            />
            <TextField
              name="changeNote"
              label={t("changeNote")}
              value={changeNote}
              onChange={(e) => setChangeNote(e.target.value)}
            />
          </div>
          <TextField
            name="description"
            label={t("description")}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
          <TextAreaField
            name="promptGuidelines"
            label={t("promptGuidelines")}
            value={promptGuidelines}
            onChange={(e) => setPromptGuidelines(e.target.value)}
          />
          <TextAreaField
            name="html"
            label={t("htmlTemplate")}
            value={html}
            onChange={(e) => setHtml(e.target.value)}
            required
          />
          <div style={{ display: "grid", gap: "0.4rem" }}>
            <span style={{ fontSize: "0.875rem", fontWeight: 500 }}>{t("livePreview")}</span>
            <iframe
              sandbox=""
              title={t("livePreview")}
              srcDoc={renderPreviewHtml(html, name.trim() || t("previewSampleTitle"))}
              style={{
                width: "100%",
                height: "360px",
                border: "1px solid var(--border-default)",
                borderRadius: "8px",
                background: "#ffffff",
              }}
            />
          </div>
          <label
            style={{
              display: "flex",
              alignItems: "center",
              gap: "0.5rem",
              fontSize: "0.875rem",
              cursor: "pointer",
            }}
          >
            <input
              type="checkbox"
              checked={isDefault}
              onChange={(e) => setIsDefault(e.target.checked)}
            />
            <span>{t("setDefault")}</span>
          </label>
          <div style={{ display: "flex", gap: "0.5rem" }}>
            <Button type="submit" variant="primary" disabled={pending}>
              {common("save")}
            </Button>
            <Button
              type="button"
              variant="secondary"
              disabled={pending}
              onClick={() => setEditing(null)}
            >
              {common("cancel")}
            </Button>
          </div>
        </form>
      )}

      {visibleItems.length === 0 ? (
        <p style={{ color: "var(--text-secondary)", fontSize: "0.875rem" }}>{t("empty")}</p>
      ) : (
        <div style={{ display: "grid", gap: "0.75rem" }}>
          {visibleItems.map((item) => (
            <div
              key={item.id}
              style={{
                display: "grid",
                gap: "0.5rem",
                padding: "1rem",
                border: "1px solid var(--border-default)",
                borderRadius: "10px",
                background: "var(--surface-primary)",
              }}
            >
              <div
                style={{
                  display: "flex",
                  flexWrap: "wrap",
                  alignItems: "center",
                  justifyContent: "space-between",
                  gap: "0.5rem",
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", flexWrap: "wrap" }}>
                  <strong>{item.name}</strong>
                  <code>{item.slug}</code>
                  <Badge tone="neutral">
                    {t(`category_${item.category}` as Parameters<typeof t>[0])}
                  </Badge>
                  <Badge tone="neutral">
                    {t("versionBadge", { version: item.currentVersion })}
                  </Badge>
                  {item.isDefault && <Badge tone="success">{t("defaultBadge")}</Badge>}
                </div>
                <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
                  <Button
                    type="button"
                    variant="secondary"
                    onClick={() =>
                      setPreviewFor(previewFor === item.id ? null : item.id)
                    }
                  >
                    {previewFor === item.id ? t("hidePreview") : t("preview")}
                  </Button>
                  <Button
                    type="button"
                    variant="secondary"
                    onClick={() => void copyCliCommand(item.slug)}
                  >
                    {t("copyCli")}
                  </Button>
                  <Button
                    type="button"
                    variant="secondary"
                    onClick={() =>
                      setHistoryFor(historyFor === item.id ? null : item.id)
                    }
                  >
                    {t("versions")}
                  </Button>
                  {canManage && (
                    <>
                      <Button
                        type="button"
                        variant="secondary"
                        disabled={pending}
                        onClick={() => openEdit(item)}
                      >
                        {t("edit")}
                      </Button>
                      <Button
                        type="button"
                        variant="secondary"
                        disabled={pending}
                        onClick={() => handleDelete(item.id)}
                      >
                        {t("delete")}
                      </Button>
                    </>
                  )}
                </div>
              </div>
              {item.description && (
                <p style={{ margin: 0, fontSize: "0.875rem", color: "var(--text-secondary)" }}>
                  {item.description}
                </p>
              )}
              {previewFor === item.id && (
                <div
                  style={{
                    marginTop: "0.5rem",
                    paddingTop: "0.75rem",
                    borderTop: "1px solid var(--border-default)",
                  }}
                >
                  <iframe
                    sandbox=""
                    title={item.name}
                    srcDoc={renderPreviewHtml(item.html, item.name || t("previewSampleTitle"))}
                    style={{
                      width: "100%",
                      height: "420px",
                      border: "1px solid var(--border-default)",
                      borderRadius: "8px",
                      background: "#ffffff",
                    }}
                  />
                </div>
              )}
              {historyFor === item.id && (
                <div
                  style={{
                    marginTop: "0.5rem",
                    paddingTop: "0.75rem",
                    borderTop: "1px solid var(--border-default)",
                    display: "grid",
                    gap: "0.4rem",
                  }}
                >
                  {item.versions.map((ver) => (
                    <div
                      key={ver.versionNumber}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        gap: "0.75rem",
                        fontSize: "0.825rem",
                      }}
                    >
                      <span>
                        <strong>
                          {t("versionBadge", { version: ver.versionNumber })}
                        </strong>{" "}
                        {ver.changeNote ? `— ${ver.changeNote}` : ""}{" "}
                        <span style={{ color: "var(--text-tertiary)" }}>
                          ({new Date(ver.createdAt).toLocaleString()})
                        </span>
                      </span>
                      {canManage && ver.versionNumber !== item.currentVersion && (
                        <Button
                          type="button"
                          variant="secondary"
                          disabled={pending}
                          onClick={() => handleRestore(item.id, ver.versionNumber)}
                        >
                          {t("restore", { version: ver.versionNumber })}
                        </Button>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
