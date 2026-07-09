import { eq } from "drizzle-orm";
import { requireToken, errorResponse, json } from "@/lib/api";
import { db } from "@/db";
import { user, organization } from "@/db/schema";

export async function GET(req: Request): Promise<Response> {
  try {
    const { userId, organizationId } = await requireToken(req);
    const [u] = await db
      .select({ id: user.id, name: user.name, email: user.email })
      .from(user)
      .where(eq(user.id, userId))
      .limit(1);
    const [org] = await db
      .select({
        id: organization.id,
        name: organization.name,
        slug: organization.slug,
      })
      .from(organization)
      .where(eq(organization.id, organizationId))
      .limit(1);
    return json({ user: u ?? null, organization: org ?? null });
  } catch (e) {
    return errorResponse(e);
  }
}
