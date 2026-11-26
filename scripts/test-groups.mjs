import { readFileSync, readdirSync } from "node:fs";
import { join, relative } from "node:path";

const DB_MARKERS = [
  /from\s+["']@\/db["']/,
  /from\s+["']@\/test\/factories["']/,
  /process\.env(?:\.DATABASE_URL|\[["']DATABASE_URL["']\])/,
  /\bcreatePrincipal\b/,
  /\bcleanupPrincipal\b/,
];

export function classifyTestSource(source) {
  return DB_MARKERS.some((pattern) => pattern.test(source)) ? "db" : "unit";
}

export function classifyTestFile(_path, source) {
  return classifyTestSource(source);
}

function walk(directory) {
  const files = [];
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) files.push(...walk(path));
    else if (entry.isFile() && entry.name.endsWith(".test.ts")) files.push(path);
  }
  return files;
}

export function collectTestGroups(root) {
  const webRoot = join(root, "apps", "web");
  const files = walk(join(webRoot, "src"));
  const groups = { unit: [], db: [] };
  for (const absolutePath of files) {
    const path = relative(webRoot, absolutePath).replaceAll("\\", "/");
    groups[classifyTestFile(path, readFileSync(absolutePath, "utf8"))].push(path);
  }
  groups.unit.sort();
  groups.db.sort();
  return groups;
}
