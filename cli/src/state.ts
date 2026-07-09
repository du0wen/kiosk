import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { join, dirname, relative, resolve } from "node:path";

const STATE_DIR = ".kiosk";
const STATE_FILE = "pages.json";

type State = {
  version: number;
  pages: Record<string, { id: string; url: string }>;
};

function statePath(root: string): string {
  return join(root, STATE_DIR, STATE_FILE);
}

/** Nearest ancestor of startDir containing a .kiosk/ dir; else startDir itself. */
export function findProjectRoot(startDir: string): string {
  let dir = resolve(startDir);
  for (;;) {
    if (existsSync(join(dir, STATE_DIR))) return dir;
    const parent = dirname(dir);
    if (parent === dir) return resolve(startDir);
    dir = parent;
  }
}

export function mappingKey(root: string, file: string): string {
  return relative(root, resolve(file));
}

export function readState(root: string): State {
  try {
    return JSON.parse(readFileSync(statePath(root), "utf8")) as State;
  } catch {
    return { version: 1, pages: {} };
  }
}

export function writeMapping(
  root: string,
  key: string,
  entry: { id: string; url: string },
): void {
  const state = readState(root);
  state.pages[key] = entry;
  const p = statePath(root);
  mkdirSync(dirname(p), { recursive: true });
  writeFileSync(p, JSON.stringify(state, null, 2));
}

export type Identity = { mode: "update"; id: string } | { mode: "create" };

export function resolveIdentity(opts: {
  root: string;
  file: string;
  id?: string;
  forceNew?: boolean;
}): Identity {
  if (opts.id) return { mode: "update", id: opts.id };
  if (opts.forceNew) return { mode: "create" };
  const existing = readState(opts.root).pages[mappingKey(opts.root, opts.file)];
  return existing ? { mode: "update", id: existing.id } : { mode: "create" };
}
