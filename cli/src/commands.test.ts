import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, writeFileSync, rmSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { publishCommand } from "./commands";
import { readState, mappingKey } from "./state";
import type { KioskClient } from "./client";

let root: string;
beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "kiosk-cmd-"));
  mkdirSync(join(root, ".kiosk"), { recursive: true }); // mark as project root
});
afterEach(() => rmSync(root, { recursive: true, force: true }));

function fakeClient(calls: string[]): KioskClient {
  return {
    async publish(html: string) {
      calls.push(`publish:${html.length}`);
      return { id: "newid", url: "https://k/p/newid" };
    },
    async update(id: string) {
      calls.push(`update:${id}`);
      return { id, url: `https://k/p/${id}` };
    },
  } as unknown as KioskClient;
}

describe("publishCommand", () => {
  it("creates on first publish and records the mapping", async () => {
    const file = join(root, "page.html");
    writeFileSync(file, "<html><title>x</title></html>");
    const calls: string[] = [];
    const url = await publishCommand(
      { client: fakeClient(calls), cwd: root },
      { file },
    );
    expect(url).toBe("https://k/p/newid");
    expect(calls[0]).toMatch(/^publish:/);
    expect(readState(root).pages[mappingKey(root, file)]?.id).toBe("newid");
  });

  it("updates when a mapping already exists", async () => {
    const file = join(root, "page.html");
    writeFileSync(file, "<html></html>");
    const calls: string[] = [];
    await publishCommand({ client: fakeClient(calls), cwd: root }, { file });
    calls.length = 0;
    const url = await publishCommand(
      { client: fakeClient(calls), cwd: root },
      { file },
    );
    expect(calls[0]).toBe("update:newid");
    expect(url).toBe("https://k/p/newid");
  });

  it("--new forces a create even with an existing mapping", async () => {
    const file = join(root, "page.html");
    writeFileSync(file, "<html></html>");
    const calls: string[] = [];
    await publishCommand({ client: fakeClient(calls), cwd: root }, { file });
    calls.length = 0;
    await publishCommand(
      { client: fakeClient(calls), cwd: root },
      { file, forceNew: true },
    );
    expect(calls[0]).toMatch(/^publish:/);
  });
});
