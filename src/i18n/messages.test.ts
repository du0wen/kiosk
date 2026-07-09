import { describe, it, expect } from "vitest";
import en from "../../messages/en.json";
import zh from "../../messages/zh.json";

function keys(obj: unknown, prefix = ""): string[] {
  if (obj && typeof obj === "object") {
    return Object.entries(obj).flatMap(([k, v]) =>
      keys(v, prefix ? `${prefix}.${k}` : k),
    );
  }
  return [prefix];
}

describe("i18n messages", () => {
  it("en and zh have identical key sets", () => {
    expect(keys(zh).sort()).toEqual(keys(en).sort());
  });
});
