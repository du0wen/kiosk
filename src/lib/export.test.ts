import { describe, it, expect, vi, afterEach } from "vitest";
import { toMarkdown, isExportFormat, exportFilename, exportPage } from "./export";

afterEach(() => vi.unstubAllGlobals());

const page = {
  publicId: "abc123XYZ789",
  title: "My Page!",
  contentHtml: "<h1>Hi</h1><p>Yo</p>",
};

describe("toMarkdown", () => {
  it("converts headings and paragraphs", () => {
    const md = toMarkdown("<h1>Title</h1><p>Body</p>");
    expect(md).toContain("# Title");
    expect(md).toContain("Body");
  });
});

describe("isExportFormat", () => {
  it("accepts known formats, rejects others", () => {
    expect(isExportFormat("pdf")).toBe(true);
    expect(isExportFormat("docx")).toBe(false);
  });
});

describe("exportFilename", () => {
  it("slugifies the title", () => {
    expect(exportFilename(page, "pdf")).toBe("my-page.pdf");
  });
  it("falls back to publicId", () => {
    expect(exportFilename({ publicId: "abc", title: null }, "md")).toBe("abc.md");
  });
});

describe("exportPage", () => {
  it("md → markdown locally", async () => {
    const r = await exportPage(page, "md");
    expect(r.contentType).toBe("text/markdown; charset=utf-8");
    expect(r.ext).toBe("md");
    expect(String(r.body)).toContain("# Hi");
  });
  it("html → raw content locally", async () => {
    const r = await exportPage(page, "html");
    expect(r.contentType).toBe("text/html; charset=utf-8");
    expect(r.body).toBe(page.contentHtml);
  });
  it("pdf → posts html to the render service and returns its bytes", async () => {
    const fetchMock = vi.fn(
      async () => new Response(new Uint8Array([1, 2, 3]), { status: 200 }),
    );
    vi.stubGlobal("fetch", fetchMock);
    const r = await exportPage(page, "pdf");
    expect(r.contentType).toBe("application/pdf");
    expect(r.ext).toBe("pdf");
    expect(Buffer.isBuffer(r.body)).toBe(true);
    const [url, init] = fetchMock.mock.calls[0] as [
      string,
      RequestInit & { headers: Record<string, string> },
    ];
    expect(url).toContain("/render");
    expect(init.headers["x-render-secret"]).toBeDefined();
    expect(JSON.parse(init.body as string)).toMatchObject({
      format: "pdf",
      html: page.contentHtml,
    });
  });
  it("maps a render-service failure to a 502-able error", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("boom", { status: 500 })));
    await expect(exportPage(page, "png")).rejects.toMatchObject({ status: 502 });
  });
});

describe("watermark", () => {
  it("html appends an escaped footer when watermark set", async () => {
    const r = await exportPage(page, "html", "ACME <secret>");
    expect(String(r.body)).toContain(page.contentHtml);
    expect(String(r.body)).toContain("ACME &lt;secret&gt;");
  });
  it("html unchanged when no watermark", async () => {
    const r = await exportPage(page, "html", null);
    expect(r.body).toBe(page.contentHtml);
  });
  it("pdf forwards the watermark to the render service", async () => {
    const fetchMock = vi.fn(
      async () => new Response(new Uint8Array([1]), { status: 200 }),
    );
    vi.stubGlobal("fetch", fetchMock);
    await exportPage(page, "pdf", "WM");
    const init = fetchMock.mock.calls[0][1] as RequestInit;
    expect(JSON.parse(init.body as string)).toMatchObject({
      format: "pdf",
      watermark: "WM",
    });
  });
});
