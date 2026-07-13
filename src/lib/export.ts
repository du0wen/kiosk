import TurndownService from "turndown";

export type ExportFormat = "md" | "html" | "pdf" | "png" | "jpeg";

const FORMATS: ExportFormat[] = ["md", "html", "pdf", "png", "jpeg"];
export function isExportFormat(v: string): v is ExportFormat {
  return (FORMATS as string[]).includes(v);
}

const RENDERED = {
  pdf: "application/pdf",
  png: "image/png",
  jpeg: "image/jpeg",
} as const;

export class ExportError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
    this.name = "ExportError";
  }
}

export function toMarkdown(html: string): string {
  return new TurndownService({
    headingStyle: "atx",
    codeBlockStyle: "fenced",
  }).turndown(html);
}

export function exportFilename(
  page: { publicId: string; title: string | null },
  ext: string,
): string {
  const slug = (page.title ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
  return `${slug || page.publicId}.${ext}`;
}

/** POST the HTML to the render microservice; return the rendered bytes. */
async function renderRemote(
  html: string,
  format: "pdf" | "png" | "jpeg",
): Promise<Buffer> {
  const base = process.env.RENDER_SERVICE_URL;
  if (!base) throw new ExportError(502, "Render service not configured");
  let res: Response;
  try {
    res = await fetch(`${base}/render`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-render-secret": process.env.RENDER_SHARED_SECRET ?? "",
      },
      body: JSON.stringify({ html, format }),
      signal: AbortSignal.timeout(30_000),
    });
  } catch (e) {
    const timedOut = e instanceof Error && e.name === "TimeoutError";
    throw new ExportError(timedOut ? 504 : 502, "Render service unreachable");
  }
  if (!res.ok) throw new ExportError(502, `Render service error: HTTP ${res.status}`);
  return Buffer.from(await res.arrayBuffer());
}

export async function exportPage(
  page: { publicId: string; title: string | null; contentHtml: string },
  format: ExportFormat,
): Promise<{ body: Buffer | string; contentType: string; ext: string }> {
  if (format === "md") {
    return {
      body: toMarkdown(page.contentHtml),
      contentType: "text/markdown; charset=utf-8",
      ext: "md",
    };
  }
  if (format === "html") {
    return {
      body: page.contentHtml,
      contentType: "text/html; charset=utf-8",
      ext: "html",
    };
  }
  const body = await renderRemote(page.contentHtml, format);
  return { body, contentType: RENDERED[format], ext: format };
}
