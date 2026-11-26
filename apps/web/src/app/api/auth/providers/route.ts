import { NextResponse } from "next/server";
import { isPublicSignupAllowed } from "@/lib/setup/config-file";

export async function GET(): Promise<NextResponse> {
  return NextResponse.json({
    emailPassword: true,
    github: Boolean(
      process.env.GITHUB_CLIENT_ID?.trim() && process.env.GITHUB_CLIENT_SECRET?.trim(),
    ),
    google: Boolean(
      process.env.GOOGLE_CLIENT_ID?.trim() && process.env.GOOGLE_CLIENT_SECRET?.trim(),
    ),
    allowPublicSignup: isPublicSignupAllowed(),
  });
}
