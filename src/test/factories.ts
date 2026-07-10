import { eq } from "drizzle-orm";
import { db } from "@/db";
import { user, organization, member, apiToken, pages } from "@/db/schema";
import { uuidv7 } from "@/lib/id";
import { provisionPersonalOrg } from "@/lib/org";
import { createToken } from "@/lib/token";

/** Create a throwaway user + personal org + API token for integration tests. */
export async function createPrincipal() {
  const userId = uuidv7();
  await db.insert(user).values({
    id: userId,
    name: `T ${userId}`,
    email: `${userId}@t.local`,
    emailVerified: true,
    createdAt: new Date(),
    updatedAt: new Date(),
  });
  const organizationId = await provisionPersonalOrg(userId, `T ${userId}`);
  const { plaintext } = await createToken({ userId, organizationId, name: "test" });
  return { userId, organizationId, token: plaintext };
}

/** Remove everything created by createPrincipal (pages → tokens → member → org → user). */
export async function cleanupPrincipal(p: {
  userId: string;
  organizationId: string;
}) {
  await db.delete(pages).where(eq(pages.organizationId, p.organizationId));
  await db.delete(apiToken).where(eq(apiToken.organizationId, p.organizationId));
  await db.delete(member).where(eq(member.organizationId, p.organizationId));
  await db.delete(organization).where(eq(organization.id, p.organizationId));
  await db.delete(user).where(eq(user.id, p.userId));
}

/** Add an extra user with a given role to an existing org; returns a token for them. */
export async function addMember(
  organizationId: string,
  role: "owner" | "admin" | "member",
): Promise<{ userId: string; token: string }> {
  const userId = uuidv7();
  await db.insert(user).values({
    id: userId,
    name: `M ${userId}`,
    email: `${userId}@t.local`,
    emailVerified: true,
    createdAt: new Date(),
    updatedAt: new Date(),
  });
  await db.insert(member).values({
    id: uuidv7(),
    organizationId,
    userId,
    role,
    createdAt: new Date(),
  });
  const { plaintext } = await createToken({ userId, organizationId, name: "test" });
  return { userId, token: plaintext };
}
