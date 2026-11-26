import { getSession } from "@/lib/session";
import { isAdminEmail } from "@/lib/console";
import { adminUnpublish } from "@/lib/admin";

export async function POST(req: Request): Promise<Response> {
  const session = await getSession();
  if (!session || !isAdminEmail(session.user.email)) {
    return Response.json(
      { error: { code: "forbidden", message: "Admins only" } },
      { status: 403 },
    );
  }
  const { publicId } = (await req.json().catch(() => ({}))) as {
    publicId?: string;
  };
  if (!publicId) {
    return Response.json(
      { error: { code: "bad_request", message: "Missing publicId" } },
      { status: 400 },
    );
  }
  const ok = await adminUnpublish(publicId);
  return Response.json({ ok });
}
