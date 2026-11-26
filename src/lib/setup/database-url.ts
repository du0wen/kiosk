export type PostgresFormFields = {
  host: string;
  port: string;
  database: string;
  username: string;
  password: string;
  ssl: boolean;
};

export function buildPostgresUrl(fields: PostgresFormFields): string {
  const host = fields.host.trim();
  const database = fields.database.trim();
  const username = fields.username.trim();
  if (!host || !database) return "";

  const port = fields.port.trim() || "5432";
  const auth = username
    ? fields.password
      ? `${encodeURIComponent(username)}:${encodeURIComponent(fields.password)}@`
      : `${encodeURIComponent(username)}@`
    : "";
  const query = fields.ssl ? "?sslmode=require" : "";
  return `postgresql://${auth}${host}:${port}/${encodeURIComponent(database)}${query}`;
}

export function parsePostgresUrl(url: string): PostgresFormFields | null {
  const trimmed = url.trim();
  if (!trimmed) return null;
  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol !== "postgres:" && parsed.protocol !== "postgresql:") {
      return null;
    }
    const sslMode = parsed.searchParams.get("sslmode")?.toLowerCase();
    return {
      host: parsed.hostname || "localhost",
      port: parsed.port || "5432",
      database: decodeURIComponent(parsed.pathname.replace(/^\/+/, "")),
      username: decodeURIComponent(parsed.username),
      password: decodeURIComponent(parsed.password),
      ssl: sslMode === "require" || sslMode === "verify-full" || sslMode === "verify-ca",
    };
  } catch {
    return null;
  }
}
