import { readFileSync } from "node:fs";
import { basename } from "node:path";
import type { KioskClient } from "./client.js";
import {
  findProjectRoot,
  resolveIdentity,
  writeMapping,
  mappingKey,
} from "./state.js";

export type PublishDeps = { client: KioskClient; cwd: string };
export type PublishArgs = {
  file: string;
  id?: string;
  forceNew?: boolean;
  title?: string;
  visibility?: "org" | "public";
};

/** Create or update a page from a file; record the mapping; return the URL. */
export async function publishCommand(
  deps: PublishDeps,
  args: PublishArgs,
): Promise<string> {
  const root = findProjectRoot(deps.cwd);
  const html = readFileSync(args.file, "utf8");
  const title = args.title ?? basename(args.file);
  const identity = resolveIdentity({
    root,
    file: args.file,
    id: args.id,
    forceNew: args.forceNew,
  });

  const result =
    identity.mode === "update"
      ? await deps.client.update(identity.id, html, title, args.visibility)
      : await deps.client.publish(html, title, args.visibility);

  writeMapping(root, mappingKey(root, args.file), {
    id: result.id,
    url: result.url,
  });
  return result.url;
}
