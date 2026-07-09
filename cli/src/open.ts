import { readState, mappingKey } from "./state.js";

/** The public URL recorded for a file in .kiosk/pages.json, or throw. */
export function resolveOpenUrl(root: string, target: string): string {
  const entry = readState(root).pages[mappingKey(root, target)];
  if (!entry) {
    throw new Error(
      `No published page mapped to ${target}. Publish it first (kiosk publish ${target}), or open the printed URL directly.`,
    );
  }
  return entry.url;
}
