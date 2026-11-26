import { spawnSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { config as loadEnv } from "dotenv";
import { collectTestGroups } from "./test-groups.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
loadEnv({ path: resolve(root, ".env"), quiet: true });

const group = process.argv[2];
if (group !== "unit" && group !== "db") {
  console.error("Usage: node scripts/run-test-group.mjs <unit|db>");
  process.exit(2);
}
if (group === "db" && !process.env.DATABASE_URL) {
  console.error("DATABASE_URL is required for the Neon integration test group.");
  process.exit(2);
}

const files = collectTestGroups(root)[group];
if (files.length === 0) {
  console.error(`No ${group} tests were discovered.`);
  process.exit(2);
}
console.log(`Running ${files.length} ${group} test files.`);
const groupArgs = group === "db"
  ? ["--reporter=verbose", "--testTimeout=30000", "--hookTimeout=30000"]
  : [];
const result = spawnSync("pnpm", ["exec", "vitest", "run", ...groupArgs, ...files], {
  cwd: resolve(root, "apps/web"),
  stdio: "inherit",
  timeout: group === "db" ? 20 * 60_000 : 10 * 60_000,
  killSignal: "SIGTERM",
});
if (result.error?.code === "ETIMEDOUT") {
  console.error(`${group} test group exceeded its bounded timeout.`);
  process.exit(1);
}
process.exit(result.status ?? 1);
