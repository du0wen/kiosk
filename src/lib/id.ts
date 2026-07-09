import { v7 } from "uuid";
import { customAlphabet } from "nanoid";

/** RFC 9562 v7 UUID (time-ordered). Used for pages.id and app-generated ids. */
export function uuidv7(): string {
  return v7();
}

const BASE62 =
  "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz";
const nano = customAlphabet(BASE62, 12);

/** 12-char base62 id for pages.public_id and public URLs (unguessable, unlisted). */
export function publicId(): string {
  return nano();
}
