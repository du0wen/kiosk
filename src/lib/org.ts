import { db } from "@/db";
import { organization, member } from "@/db/schema";
import { uuidv7, publicId } from "@/lib/id";

/**
 * Create a user's personal organization + owner membership.
 * Called once from the signup hook (auth.ts). Slug is unique via a random suffix.
 */
export async function provisionPersonalOrg(
  userId: string,
  displayName: string,
): Promise<string> {
  const orgId = uuidv7();
  await db.insert(organization).values({
    id: orgId,
    name: `${displayName}'s workspace`,
    slug: `u-${publicId().toLowerCase()}`,
    createdAt: new Date(),
  });
  await db.insert(member).values({
    id: uuidv7(),
    organizationId: orgId,
    userId,
    role: "owner",
    createdAt: new Date(),
  });
  return orgId;
}
