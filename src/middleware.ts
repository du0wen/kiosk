import { NextResponse, type NextRequest } from "next/server";
import { routeForHost } from "@/lib/serving";

export function middleware(req: NextRequest) {
  const host = req.headers.get("host") ?? "";
  const decision = routeForHost({ host, pathname: req.nextUrl.pathname });

  if (decision.type === "redirect") {
    return NextResponse.redirect(decision.url, 302);
  }
  if (decision.type === "notFound") {
    return new NextResponse("Not found", { status: 404 });
  }
  // Pass through. Anti-clickjacking for the app; served /p/* pages stay embeddable.
  const res = NextResponse.next();
  if (!req.nextUrl.pathname.startsWith("/p/")) {
    res.headers.set("X-Frame-Options", "DENY");
  }
  return res;
}

export const config = {
  // Run on everything except Next's internal static assets and the favicon.
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
