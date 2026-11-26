import { NextResponse, type NextRequest } from "next/server";
import { routeForHost } from "@/lib/serving";

function isSetupPath(pathname: string): boolean {
  return (
    pathname === "/setup" ||
    pathname.startsWith("/setup/") ||
    pathname === "/api/setup" ||
    pathname.startsWith("/api/setup/")
  );
}

export function middleware(req: NextRequest) {
  const pathname = req.nextUrl.pathname;
  const host = req.headers.get("host") ?? "";
  // Setup routes enforce their own live Node.js lock/unlock state so hot-reload
  // after /api/setup/complete works immediately without restarting the server.
  const decision = isSetupPath(pathname)
    ? ({ type: "next" } as const)
    : routeForHost({ host, pathname });

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
    res.headers.set("Content-Security-Policy", "frame-ancestors 'none'");
    res.headers.set("X-Content-Type-Options", "nosniff");
    res.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
    res.headers.set(
      "Permissions-Policy",
      "camera=(), microphone=(), geolocation=(), payment=(), usb=()",
    );
  }
  return res;
}

export const config = {
  // Run on everything except Next's internal static assets and the favicon.
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
