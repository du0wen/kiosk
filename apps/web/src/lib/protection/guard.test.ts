import { describe, expect, it, vi } from "vitest";
import { InMemoryProtectionStore } from "./memory-store";
import { DEFAULT_PROTECTION_POLICY } from "./policy";
import {
  enforceIdentifierLimit,
  enforceRequestIpLimit,
  enforceRequestLimit,
} from "./guard";

const KEY = Buffer.alloc(32, 7).toString("base64");

describe("protection guards", () => {
  it("builds opaque keys for request IP and identity dimensions", async () => {
    const store = new InMemoryProtectionStore();
    const consume = vi.spyOn(store, "consumeFixedWindow");
    const runtime = {
      store,
      policy: DEFAULT_PROTECTION_POLICY,
      keySecret: KEY,
      trustedClientIpHeaders: ["x-real-ip"],
      nowMs: () => 5_000,
    };
    const request = new Request("https://app.example", {
      headers: { "x-real-ip": "203.0.113.7" },
    });

    await enforceRequestIpLimit(request, "cliMintPreAuth", "cli-mint", runtime);
    await enforceIdentifierLimit(
      "cliMintPostAuth",
      "cli-user",
      ["user@example.com", "org-1"],
      runtime,
    );
    await enforceRequestLimit(
      request,
      "report",
      "report",
      ["page-public-id"],
      runtime,
    );
    expect(consume).toHaveBeenCalledTimes(3);
    expect(JSON.stringify(consume.mock.calls)).not.toContain("203.0.113.7");
    expect(JSON.stringify(consume.mock.calls)).not.toContain("user@example.com");
    expect(JSON.stringify(consume.mock.calls)).not.toContain("page-public-id");
  });
});
