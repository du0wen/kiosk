import { and, desc, eq, isNull } from "drizzle-orm";
import { db } from "@/db";
import {
  orgTemplates,
  orgTemplateVersion,
  pageContent,
  type OrgTemplate,
  type OrgTemplateVersion,
} from "@/db/schema";
import { uuidv7 } from "@/lib/id";
import {
  contentRepository,
  type PreparedExternalContent,
} from "@/lib/storage/content-repository";
import {
  isTemplateCategory,
  TEMPLATE_CATEGORIES,
  type TemplateCategory,
} from "./template-categories";

export { isTemplateCategory, TEMPLATE_CATEGORIES, type TemplateCategory };

export function normalizeTemplateSlug(raw: string): string {
  const slug = raw
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64);
  if (!slug || !/^[a-z0-9][a-z0-9-]{0,63}$/.test(slug)) {
    throw new Error("Template slug must contain lowercase letters, numbers, or hyphens");
  }
  return slug;
}

export function applyTemplateShell(
  templateHtml: string,
  bodyHtml: string,
  title?: string,
): string {
  let out = templateHtml;
  if (title !== undefined) {
    out = out.replace(/\{\{\s*TITLE\s*\}\}/g, title);
  }
  if (/\{\{\s*CONTENT\s*\}\}/.test(out)) {
    return out.replace(/\{\{\s*CONTENT\s*\}\}/g, bodyHtml);
  }
  return `${out}\n${bodyHtml}`;
}

export const STARTER_TEMPLATES: Array<{
  slug: string;
  name: string;
  category: TemplateCategory;
  description: string;
  promptGuidelines: string;
  html: string;
}> = [
  {
    slug: "exec-report",
    name: "Executive Analysis Report",
    category: "report",
    description: "Clean editorial layout for quarterly reviews, research reports, and briefings.",
    promptGuidelines:
      "Use semantic sections, executive summary callout at top, concise metric cards, and clean data tables. Keep all CSS inline with zero external network assets.",
    html: `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width,initial-scale=1" />
<title>{{TITLE}}</title>
<style>
  :root { --accent: #0f766e; --ink: #0f172a; --muted: #475569; --line: #e2e8f0; --bg: #ffffff; }
  body { margin: 0; font: 15px/1.65 system-ui, -apple-system, sans-serif; color: var(--ink); background: #f8fafc; }
  main { max-width: 860px; margin: 32px auto; background: var(--bg); border: 1px solid var(--line); border-radius: 12px; padding: 40px 48px; }
  header { border-bottom: 2px solid var(--accent); padding-bottom: 16px; margin-bottom: 28px; }
  h1 { margin: 0 0 8px; font-size: 28px; letter-spacing: -0.02em; }
  h2 { margin: 28px 0 12px; font-size: 19px; color: var(--accent); }
  table { width: 100%; border-collapse: collapse; margin: 16px 0; }
  th, td { border-bottom: 1px solid var(--line); padding: 10px 12px; text-align: left; }
  th { font-size: 12px; text-transform: uppercase; color: var(--muted); }
</style>
</head>
<body>
<main>
  <header><h1>{{TITLE}}</h1></header>
  {{CONTENT}}
</main>
</body>
</html>`,
  },
  {
    slug: "tech-proposal",
    name: "Technical Proposal / RFC",
    category: "proposal",
    description: "Structured RFC template with context, architecture options, trade-offs, and rollout plan.",
    promptGuidelines:
      "Include Context, Goals/Non-Goals, Architecture Comparison Table, Risks & Mitigations, and Rollout Checklist. Inline SVG diagrams preferred.",
    html: `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width,initial-scale=1" />
<title>{{TITLE}}</title>
<style>
  body { margin: 0; font: 15px/1.7 ui-sans-serif, system-ui, sans-serif; color: #1e293b; background: #fff; }
  article { max-width: 820px; margin: 0 auto; padding: 48px 24px; }
  h1 { font-size: 30px; border-left: 4px solid #2563eb; padding-left: 16px; margin: 0 0 24px; }
  h2 { font-size: 20px; margin-top: 32px; border-bottom: 1px solid #e2e8f0; padding-bottom: 6px; }
  pre { background: #0f172a; color: #e2e8f0; padding: 16px; border-radius: 8px; overflow-x: auto; }
  code { font-family: ui-monospace, SFMono-Regular, monospace; font-size: 13px; }
</style>
</head>
<body>
<article>
  <h1>{{TITLE}}</h1>
  {{CONTENT}}
</article>
</body>
</html>`,
  },
  {
    slug: "kpi-dashboard",
    name: "Metrics & KPI Dashboard",
    category: "dashboard",
    description: "Responsive multi-card KPI grid for operational snapshots and weekly status.",
    promptGuidelines:
      "Lead with a 3-to-4 column KPI summary grid followed by inline SVG trend charts and status breakdown tables. Use high-contrast status pills.",
    html: `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width,initial-scale=1" />
<title>{{TITLE}}</title>
<style>
  body { margin: 0; font: 14px/1.5 system-ui, sans-serif; background: #f1f5f9; color: #0f172a; padding: 28px; }
  .shell { max-width: 1120px; margin: 0 auto; display: grid; gap: 20px; }
  h1 { margin: 0; font-size: 24px; }
  .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 16px; }
  .card { background: #fff; border: 1px solid #e2e8f0; border-radius: 10px; padding: 20px; }
</style>
</head>
<body>
<div class="shell">
  <h1>{{TITLE}}</h1>
  {{CONTENT}}
</div>
</body>
</html>`,
  },
];

async function ensureExternalContent(
  tx: Pick<typeof db, "insert" | "select">,
  organizationId: string,
  external: PreparedExternalContent | null,
): Promise<string | null> {
  if (!external) return null;
  const [inserted] = await tx
    .insert(pageContent)
    .values({
      organizationId,
      storageProfileId: external.storageProfileId,
      objectKey: external.objectKey,
      contentHash: external.contentHash,
      sizeBytes: external.sizeBytes,
    })
    .onConflictDoNothing()
    .returning({ id: pageContent.id });
  if (inserted) return inserted.id;
  const [existing] = await tx
    .select({ id: pageContent.id })
    .from(pageContent)
    .where(
      and(
        eq(pageContent.organizationId, organizationId),
        eq(pageContent.storageProfileId, external.storageProfileId),
        eq(pageContent.contentHash, external.contentHash),
      ),
    )
    .limit(1);
  if (!existing) throw new Error("Failed to resolve stored template content reference");
  return existing.id;
}

export async function createOrgTemplate(input: {
  organizationId: string;
  slug: string;
  name: string;
  category: TemplateCategory;
  description?: string | null;
  promptGuidelines?: string | null;
  html: string;
  isDefault?: boolean;
  actorUserId: string;
  changeNote?: string | null;
}): Promise<OrgTemplate> {
  const slug = normalizeTemplateSlug(input.slug);
  const name = input.name.trim();
  if (!name || name.length > 100) {
    throw new Error("Template name must be 1-100 characters");
  }
  if (!isTemplateCategory(input.category)) {
    throw new Error("Invalid template category");
  }
  if (!input.html.trim()) {
    throw new Error("Template HTML cannot be empty");
  }

  return contentRepository.write(
    { organizationId: input.organizationId, html: input.html },
    async (prepared) =>
      db.transaction(async (tx) => {
        const contentId = await ensureExternalContent(
          tx,
          input.organizationId,
          prepared.external,
        );
        if (input.isDefault) {
          await tx
            .update(orgTemplates)
            .set({ isDefault: false })
            .where(
              and(
                eq(orgTemplates.organizationId, input.organizationId),
                eq(orgTemplates.category, input.category),
                isNull(orgTemplates.deletedAt),
              ),
            );
        }
        const templateId = uuidv7();
        const [created] = await tx
          .insert(orgTemplates)
          .values({
            id: templateId,
            organizationId: input.organizationId,
            slug,
            name,
            category: input.category,
            description: input.description?.trim() || null,
            promptGuidelines: input.promptGuidelines?.trim() || null,
            currentContentId: contentId,
            legacyHtml: prepared.legacyHtml,
            currentVersion: 1,
            isDefault: Boolean(input.isDefault),
            createdBy: input.actorUserId,
            updatedBy: input.actorUserId,
          })
          .returning();

        await tx.insert(orgTemplateVersion).values({
          templateId,
          versionNumber: 1,
          contentId,
          legacyHtml: prepared.legacyHtml,
          promptGuidelines: input.promptGuidelines?.trim() || null,
          changeNote: input.changeNote?.trim() || "Initial version",
          createdBy: input.actorUserId,
        });

        return created;
      }),
  );
}

export async function updateOrgTemplate(input: {
  organizationId: string;
  templateId: string;
  name?: string;
  category?: TemplateCategory;
  description?: string | null;
  promptGuidelines?: string | null;
  html: string;
  isDefault?: boolean;
  actorUserId: string;
  changeNote?: string | null;
}): Promise<OrgTemplate | null> {
  const [existing] = await db
    .select()
    .from(orgTemplates)
    .where(
      and(
        eq(orgTemplates.id, input.templateId),
        eq(orgTemplates.organizationId, input.organizationId),
        isNull(orgTemplates.deletedAt),
      ),
    )
    .limit(1);
  if (!existing) return null;

  const nextCategory = input.category ?? (existing.category as TemplateCategory);
  if (!isTemplateCategory(nextCategory)) {
    throw new Error("Invalid template category");
  }
  const nextName = input.name !== undefined ? input.name.trim() : existing.name;
  if (!nextName || nextName.length > 100) {
    throw new Error("Template name must be 1-100 characters");
  }

  return contentRepository.write(
    { organizationId: input.organizationId, html: input.html },
    async (prepared) =>
      db.transaction(async (tx) => {
        const contentId = await ensureExternalContent(
          tx,
          input.organizationId,
          prepared.external,
        );
        if (input.isDefault) {
          await tx
            .update(orgTemplates)
            .set({ isDefault: false })
            .where(
              and(
                eq(orgTemplates.organizationId, input.organizationId),
                eq(orgTemplates.category, nextCategory),
                isNull(orgTemplates.deletedAt),
              ),
            );
        }
        const nextVersion = existing.currentVersion + 1;
        const nextGuidelines =
          input.promptGuidelines !== undefined
            ? input.promptGuidelines?.trim() || null
            : existing.promptGuidelines;

        const [updated] = await tx
          .update(orgTemplates)
          .set({
            name: nextName,
            category: nextCategory,
            description:
              input.description !== undefined
                ? input.description?.trim() || null
                : existing.description,
            promptGuidelines: nextGuidelines,
            currentContentId: contentId,
            legacyHtml: prepared.legacyHtml,
            currentVersion: nextVersion,
            ...(input.isDefault !== undefined ? { isDefault: input.isDefault } : {}),
            updatedBy: input.actorUserId,
            updatedAt: new Date(),
          })
          .where(eq(orgTemplates.id, existing.id))
          .returning();

        await tx.insert(orgTemplateVersion).values({
          templateId: existing.id,
          versionNumber: nextVersion,
          contentId,
          legacyHtml: prepared.legacyHtml,
          promptGuidelines: nextGuidelines,
          changeNote: input.changeNote?.trim() || null,
          createdBy: input.actorUserId,
        });

        return updated;
      }),
  );
}

export async function listOrgTemplates(params: {
  organizationId: string;
  category?: string | null;
}): Promise<OrgTemplate[]> {
  const conditions = [
    eq(orgTemplates.organizationId, params.organizationId),
    isNull(orgTemplates.deletedAt),
  ];
  if (params.category && isTemplateCategory(params.category)) {
    conditions.push(eq(orgTemplates.category, params.category));
  }
  return db
    .select()
    .from(orgTemplates)
    .where(and(...conditions))
    .orderBy(desc(orgTemplates.isDefault), desc(orgTemplates.updatedAt));
}

export async function getOrgTemplateBySlug(params: {
  organizationId: string;
  slug: string;
  version?: number;
}): Promise<{
  template: OrgTemplate;
  versionNumber: number;
  html: string;
  promptGuidelines: string | null;
} | null> {
  const [template] = await db
    .select()
    .from(orgTemplates)
    .where(
      and(
        eq(orgTemplates.organizationId, params.organizationId),
        eq(orgTemplates.slug, params.slug),
        isNull(orgTemplates.deletedAt),
      ),
    )
    .limit(1);
  if (!template) return null;

  if (params.version !== undefined && params.version !== template.currentVersion) {
    const [ver] = await db
      .select()
      .from(orgTemplateVersion)
      .where(
        and(
          eq(orgTemplateVersion.templateId, template.id),
          eq(orgTemplateVersion.versionNumber, params.version),
        ),
      )
      .limit(1);
    if (!ver) return null;
    const html = await contentRepository.read({
      organizationId: params.organizationId,
      contentId: ver.contentId,
      legacyHtml: ver.legacyHtml,
    });
    return {
      template,
      versionNumber: ver.versionNumber,
      html,
      promptGuidelines: ver.promptGuidelines,
    };
  }

  const html = await contentRepository.read({
    organizationId: params.organizationId,
    contentId: template.currentContentId,
    legacyHtml: template.legacyHtml,
  });
  return {
    template,
    versionNumber: template.currentVersion,
    html,
    promptGuidelines: template.promptGuidelines,
  };
}

export async function listOrgTemplateVersions(params: {
  organizationId: string;
  templateId: string;
}): Promise<OrgTemplateVersion[]> {
  const [template] = await db
    .select({ id: orgTemplates.id })
    .from(orgTemplates)
    .where(
      and(
        eq(orgTemplates.id, params.templateId),
        eq(orgTemplates.organizationId, params.organizationId),
        isNull(orgTemplates.deletedAt),
      ),
    )
    .limit(1);
  if (!template) return [];

  return db
    .select()
    .from(orgTemplateVersion)
    .where(eq(orgTemplateVersion.templateId, template.id))
    .orderBy(desc(orgTemplateVersion.versionNumber));
}

export async function restoreOrgTemplateVersion(params: {
  organizationId: string;
  templateId: string;
  versionNumber: number;
  actorUserId: string;
}): Promise<OrgTemplate | null> {
  const [template] = await db
    .select()
    .from(orgTemplates)
    .where(
      and(
        eq(orgTemplates.id, params.templateId),
        eq(orgTemplates.organizationId, params.organizationId),
        isNull(orgTemplates.deletedAt),
      ),
    )
    .limit(1);
  if (!template) return null;

  const [ver] = await db
    .select()
    .from(orgTemplateVersion)
    .where(
      and(
        eq(orgTemplateVersion.templateId, template.id),
        eq(orgTemplateVersion.versionNumber, params.versionNumber),
      ),
    )
    .limit(1);
  if (!ver) return null;

  const html = await contentRepository.read({
    organizationId: params.organizationId,
    contentId: ver.contentId,
    legacyHtml: ver.legacyHtml,
  });

  return updateOrgTemplate({
    organizationId: params.organizationId,
    templateId: template.id,
    html,
    promptGuidelines: ver.promptGuidelines,
    actorUserId: params.actorUserId,
    changeNote: `Restored from v${params.versionNumber}`,
  });
}

export async function deleteOrgTemplate(params: {
  organizationId: string;
  templateId: string;
}): Promise<boolean> {
  const [deleted] = await db
    .update(orgTemplates)
    .set({ deletedAt: new Date(), isDefault: false })
    .where(
      and(
        eq(orgTemplates.id, params.templateId),
        eq(orgTemplates.organizationId, params.organizationId),
        isNull(orgTemplates.deletedAt),
      ),
    )
    .returning({ id: orgTemplates.id });
  return Boolean(deleted);
}
