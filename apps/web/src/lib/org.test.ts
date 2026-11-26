import { describe, it, expect, afterEach } from "vitest";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { user, organization, member } from "@/db/schema";
import { uuidv7 } from "@/lib/id";
import { provisionPersonalOrg } from "./org";

let userId: string | null = null;
let orgId: string | null = null;

afterEach(async () => {
  if (orgId) {
    await db.delete(member).where(eq(member.organizationId, orgId));
    await db.delete(organization).where(eq(organization.id, orgId));
    orgId = null;
  }
  if (userId) {
    await db.delete(user).where(eq(user.id, userId));
    userId = null;
  }
});

describe("provisionPersonalOrg", () => {
  it("creates one org and one owner membership for the user", async () => {
    const uid = uuidv7();
    userId = uid;
    await db.insert(user).values({
      id: uid,
      name: `T ${uid}`,
      email: `${uid}@t.local`,
      emailVerified: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    orgId = await provisionPersonalOrg(uid, `T ${uid}`);

    const orgs = await db
      .select()
      .from(organization)
      .where(eq(organization.id, orgId));
    const members = await db.select().from(member).where(eq(member.userId, uid));
    expect(orgs).toHaveLength(1);
    expect(members).toHaveLength(1);
    expect(members[0].role).toBe("owner");
    expect(members[0].organizationId).toBe(orgId);
  });
});
