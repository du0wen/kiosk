import { errorResponse, json } from "@/lib/api";
import { requireApiAccess } from "@/lib/protection/api-access";
import { getCallerProfile } from "@/lib/page-operations";

export async function GET(req: Request): Promise<Response> {
  try {
    const caller = await requireApiAccess(req, { scope: "identity:read" });
    return json(await getCallerProfile(caller));
  } catch (e) {
    return errorResponse(e);
  }
}
