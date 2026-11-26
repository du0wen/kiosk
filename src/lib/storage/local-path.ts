import { resolve } from "node:path";

export const DEFAULT_LOCAL_STORAGE_RELATIVE_DIR = "data/storage";

export function resolveLocalStorageDir(
  env: Record<string, string | undefined> = process.env,
  cwd: string = process.cwd(),
): string {
  const configured = env.STORAGE_LOCAL_DIR?.trim();
  if (!configured) {
    return resolve(cwd, "data", "storage");
  }
  return resolve(cwd, configured);
}
