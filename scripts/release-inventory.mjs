import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const contract = JSON.parse(readFileSync(resolve(root, "release/contract.json"), "utf8"));

function git(...args) {
  const result = spawnSync("git", args, { cwd: root, encoding: "utf8" });
  return result.status === 0 ? result.stdout.trim() : null;
}

const status = git("status", "--porcelain=v1", "--untracked-files=all");
const worktreeFiles = status
  ? status.split("\n").filter(Boolean).map((line) => line.slice(3))
  : [];

console.log(JSON.stringify({
  gitSha: git("rev-parse", "HEAD"),
  branch: git("branch", "--show-current"),
  clean: worktreeFiles.length === 0,
  worktreeFiles,
  releaseUnits: contract.units,
  migrationHead: contract.migrationHead,
  requiredOwnerInputs: contract.requiredOwnerInputs,
}, null, 2));
