import { NextResponse } from "next/server";
import { z } from "zod";
import { isAdminEmail } from "@/lib/console";
import { getSession } from "@/lib/session";
import {
  isPublicSignupAllowed,
  setPublicSignupAllowed,
} from "@/lib/setup/config-file";

const patchSchema = z.object({
  allowPublicSignup: z.boolean(),
});

export async function GET(): Promise<NextResponse> {
  const session = await getSession();
  if (!session || !isAdminEmail(session.user.email)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  return NextResponse.json({
    allowPublicSignup: isPublicSignupAllowed(),
  });
}

export async function PATCH(req: Request): Promise<NextResponse> {
  const session = await getSession();
  if (!session || !isAdminEmail(session.user.email)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON payload" }, { status: 400 });
  }

  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "allowPublicSignup must be a boolean" },
      { status: 400 },
    );
  }

  await setPublicSignupAllowed(parsed.data.allowPublicSignup);
  return NextResponse.json({
    allowPublicSignup: isPublicSignupAllowed(),
  });
}
