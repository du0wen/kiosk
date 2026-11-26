export class CliError extends Error {
  constructor(
    message: string,
    public exitCode = 1,
  ) {
    super(message);
    this.name = "CliError";
  }
}

export type PageResult = { id: string; url: string; [k: string]: unknown };

async function responseError(res: Response): Promise<CliError> {
  let message = `HTTP ${res.status}`;
  try {
    const body = (await res.json()) as { error?: { message?: string } };
    message = body?.error?.message ?? message;
  } catch {
    // non-JSON error body
  }
  if (res.status === 429) {
    const retryAfter = res.headers.get("retry-after");
    if (retryAfter && /^\d+$/.test(retryAfter)) {
      message = `${message}. Retry in ${retryAfter} seconds.`;
    }
  }
  return new CliError(message, res.status === 401 ? 2 : 1);
}

export class KioskClient {
  constructor(
    private apiBase: string,
    private token: string,
  ) {}

  private async req(
    method: string,
    path: string,
    opts: { html?: string; title?: string; visibility?: "org" | "public" } = {},
  ): Promise<Response> {
    const headers: Record<string, string> = {
      authorization: `Bearer ${this.token}`,
    };
    if (opts.html !== undefined) headers["content-type"] = "text/html";
    if (opts.title) headers["x-kiosk-title"] = opts.title;
    if (opts.visibility) headers["x-kiosk-visibility"] = opts.visibility;
    return fetch(`${this.apiBase}${path}`, { method, headers, body: opts.html });
  }

  private async parse(res: Response): Promise<unknown> {
    if (res.ok) return res.status === 204 ? undefined : res.json();
    throw await responseError(res);
  }

  async publish(
    html: string,
    title?: string,
    visibility?: "org" | "public",
  ): Promise<PageResult> {
    return (await this.parse(
      await this.req("POST", "/pages", { html, title, visibility }),
    )) as PageResult;
  }
  async update(
    id: string,
    html: string,
    title?: string,
    visibility?: "org" | "public",
  ): Promise<PageResult> {
    return (await this.parse(
      await this.req("PUT", `/pages/${id}`, { html, title, visibility }),
    )) as PageResult;
  }
  async setVisibility(
    id: string,
    visibility: "org" | "public",
  ): Promise<PageResult> {
    const res = await fetch(`${this.apiBase}/pages/${id}`, {
      method: "PATCH",
      headers: {
        authorization: `Bearer ${this.token}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({ visibility }),
    });
    return (await this.parse(res)) as PageResult;
  }
  async list(): Promise<{ pages: unknown[] }> {
    return (await this.parse(await this.req("GET", "/pages"))) as {
      pages: unknown[];
    };
  }
  async del(id: string): Promise<void> {
    await this.parse(await this.req("DELETE", `/pages/${id}`));
  }
  async me(): Promise<unknown> {
    return this.parse(await this.req("GET", "/me"));
  }
  async listTemplates(category?: string): Promise<{ templates: unknown[] }> {
    const q = category ? `?category=${encodeURIComponent(category)}` : "";
    return (await this.parse(await this.req("GET", `/templates${q}`))) as {
      templates: unknown[];
    };
  }
  async getTemplate(
    slug: string,
    version?: number,
  ): Promise<{ html: string; [key: string]: unknown }> {
    const q = version ? `?version=${version}` : "";
    return (await this.parse(
      await this.req("GET", `/templates/${encodeURIComponent(slug)}${q}`),
    )) as { html: string; [key: string]: unknown };
  }
  async exportFile(
    id: string,
    format: string,
  ): Promise<{ data: Buffer; filename: string }> {
    const res = await fetch(
      `${this.apiBase}/pages/${id}/export?format=${format}`,
      { headers: { authorization: `Bearer ${this.token}` } },
    );
    if (!res.ok) {
      throw await responseError(res);
    }
    const dispo = res.headers.get("content-disposition") ?? "";
    const m = dispo.match(/filename="([^"]+)"/);
    return {
      data: Buffer.from(await res.arrayBuffer()),
      filename: m?.[1] ?? `${id}.${format}`,
    };
  }
}
