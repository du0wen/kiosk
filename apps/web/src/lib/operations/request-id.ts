import { randomUUID } from "node:crypto";
import { parseRequestId } from "./events";

export function createRequestId(source: () => string = randomUUID): string {
  return parseRequestId(source());
}
