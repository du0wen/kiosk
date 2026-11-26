import { createHmac } from "node:crypto";
import type { SecretValue } from "@/lib/runtime-config";

export function hashOperationalIdentifier(value: string, secret: SecretValue): string {
  return createHmac("sha256", Buffer.from(secret.reveal(), "base64"))
    .update(value, "utf8")
    .digest("hex");
}
