import { describe, expect, it } from "vitest";
import { buildPostgresUrl, parsePostgresUrl } from "./database-url";

describe("setup database-url helper", () => {
  it("builds a properly URL-encoded PostgreSQL connection string", () => {
    expect(
      buildPostgresUrl({
        host: "db.example.com",
        port: "5432",
        database: "kiosk",
        username: "kiosk_admin",
        password: "p@ss#word/100%",
        ssl: true,
      }),
    ).toBe(
      "postgresql://kiosk_admin:p%40ss%23word%2F100%25@db.example.com:5432/kiosk?sslmode=require",
    );
  });

  it("supports empty password for local trust authentication", () => {
    expect(
      buildPostgresUrl({
        host: "localhost",
        port: "5432",
        database: "kiosk_setup_test",
        username: "kevin",
        password: "",
        ssl: false,
      }),
    ).toBe("postgresql://kevin@localhost:5432/kiosk_setup_test");
  });

  it("parses an existing URL back into fields without losing special characters", () => {
    const parsed = parsePostgresUrl(
      "postgresql://kiosk_admin:p%40ss%23word%2F100%25@db.example.com:5433/kiosk?sslmode=require",
    );
    expect(parsed).toEqual({
      host: "db.example.com",
      port: "5433",
      database: "kiosk",
      username: "kiosk_admin",
      password: "p@ss#word/100%",
      ssl: true,
    });
  });

  it("returns null for invalid or non-postgres URLs", () => {
    expect(parsePostgresUrl("not-a-url")).toBeNull();
    expect(parsePostgresUrl("mysql://user:pass@localhost/db")).toBeNull();
  });
});
