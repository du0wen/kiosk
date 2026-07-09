import { and, eq, isNull } from "drizzle-orm";
import { db } from "@/db";
import { pages } from "@/db/schema";

/** Platform-admin unpublish: soft-delete ANY active page (no org scope). */
export async function adminUnpublish(publicId: string): Promise<boolean> {
  const [row] = await db
    .update(pages)
    .set({ deletedAt: new Date() })
    .where(and(eq(pages.publicId, publicId), isNull(pages.deletedAt)))
    .returning({ id: pages.id });
  return !!row;
}
