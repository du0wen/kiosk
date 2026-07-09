import { headers } from "next/headers";
import { auth } from "@/lib/auth";

/** Current session/user on the server, or null. */
export async function getSession() {
  return auth.api.getSession({ headers: await headers() });
}
