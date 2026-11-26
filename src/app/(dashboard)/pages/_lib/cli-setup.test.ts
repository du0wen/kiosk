import { describe, expect, it } from "vitest";
import { cliCommands } from "./cli-setup";

describe("cliCommands", () => {
  it("lists login, skill install, and publish with real commands", () => {
    const ids = cliCommands("https://kiosk.example/api/v1").map((c) => c.id);
    expect(ids).toEqual(["login", "skill", "publish", "apiBase"]);
  });

  it("embeds the workspace API base when known", () => {
    const apiBase = cliCommands("https://kiosk.example/api/v1").find((c) => c.id === "apiBase");
    expect(apiBase?.command).toBe("export KIOSK_API_BASE=https://kiosk.example/api/v1");
  });

  it("falls back to a placeholder when the origin is unknown", () => {
    const apiBase = cliCommands("").find((c) => c.id === "apiBase");
    expect(apiBase?.command).toContain("<your-kiosk-domain>");
  });
});
