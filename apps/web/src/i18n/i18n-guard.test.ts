import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";
import en from "./messages/en.json";
import zh from "./messages/zh.json";

const ROOT = process.cwd();

function flattenMessages(
  obj: Record<string, unknown>,
  prefix = "",
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(obj)) {
    const key = prefix ? `${prefix}.${k}` : k;
    if (v && typeof v === "object" && !Array.isArray(v)) {
      Object.assign(out, flattenMessages(v as Record<string, unknown>, key));
    } else {
      out[key] = String(v ?? "");
    }
  }
  return out;
}

function extractPlaceholders(message: string): string[] {
  const matches = message.match(/\{([A-Za-z0-9_]+)(?:,|\})/g) ?? [];
  return [...new Set(matches.map((m) => m.slice(1, -1)))].sort();
}

function walkTsxFiles(dir: string, acc: string[] = []): string[] {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) walkTsxFiles(full, acc);
    else if (full.endsWith(".tsx")) acc.push(full);
  }
  return acc;
}

describe("i18n governance guardrails", () => {
  it("enforces non-empty values and identical ICU placeholders across all locales", () => {
    const fEn = flattenMessages(en as Record<string, unknown>);
    const fZh = flattenMessages(zh as Record<string, unknown>);

    const issues: string[] = [];
    for (const [key, enVal] of Object.entries(fEn)) {
      if (!enVal.trim()) issues.push(`en.${key} is empty`);
      const zhVal = fZh[key];
      if (!zhVal || !zhVal.trim()) {
        issues.push(`zh.${key} is missing or empty`);
        continue;
      }
      const enVars = extractPlaceholders(enVal);
      const zhVars = extractPlaceholders(zhVal);
      if (enVars.join(",") !== zhVars.join(",")) {
        issues.push(
          `Placeholder mismatch at ${key}: en=[${enVars.join(",")}] vs zh=[${zhVars.join(",")}]`,
        );
      }
    }
    expect(issues).toEqual([]);
  });

  it("forbids hardcoded UI text in label/aria-label/title props across TSX components", () => {
    const files = [
      ...walkTsxFiles(join(ROOT, "src/app")),
      ...walkTsxFiles(join(ROOT, "src/components")),
    ];
    const violations: string[] = [];

    for (const file of files) {
      const src = readFileSync(file, "utf8");
      const rel = relative(ROOT, file);
      const propRe = /\b(label|aria-label|title)="([^"]+)"/g;
      let match: RegExpExecArray | null;
      while ((match = propRe.exec(src)) !== null) {
        const val = match[2].trim();
        // Allow brand name, URLs, and pure technical placeholders/paths
        if (!val || /^(Kiosk|https?:|\/|#)/.test(val)) continue;
        const line = src.slice(0, match.index).split("\n").length;
        violations.push(`${rel}:${line} hardcoded ${match[1]}=${JSON.stringify(val)}`);
      }
    }

    expect(violations).toEqual([]);
  });

  it("forbids caching translated t(...) strings inside React state setters (breaks live locale switching)", () => {
    const files = [
      ...walkTsxFiles(join(ROOT, "src/app")),
      ...walkTsxFiles(join(ROOT, "src/components")),
    ];
    const violations: string[] = [];

    for (const file of files) {
      const src = readFileSync(file, "utf8");
      const rel = relative(ROOT, file);
      const setterRe = /\bset(Error|Info|Notice|Status|Message)\(\s*t\(/g;
      let match: RegExpExecArray | null;
      while ((match = setterRe.exec(src)) !== null) {
        const line = src.slice(0, match.index).split("\n").length;
        violations.push(
          `${rel}:${line} stores translated t(...) string in state via ${match[0].trim()}... (store key/values instead)`,
        );
      }
    }

    expect(violations).toEqual([]);
  });
});
