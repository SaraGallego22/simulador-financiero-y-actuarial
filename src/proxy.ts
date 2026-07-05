import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";

/**
 * Role-based route gating. Named `proxy.ts` (not `middleware.ts`) because
 * Next.js 16 renamed the file convention — see CLAUDE.md §3 for why this
 * matters (the legacy convention is deprecated, not just relocated).
 */
export default auth((req) => {
  const { pathname } = req.nextUrl;
  const session = req.auth;

  if (pathname === "/login") {
    if (session) return NextResponse.redirect(new URL("/", req.nextUrl));
    return NextResponse.next();
  }

  if (!session) {
    return NextResponse.redirect(new URL("/login", req.nextUrl));
  }

  if (pathname.startsWith("/admin") && session.user.role !== "ADMIN") {
    return NextResponse.redirect(new URL("/", req.nextUrl));
  }

  return NextResponse.next();
});

export const config = {
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico|.*\\.(?:png|jpg|jpeg|svg|gif|webp|ico)$).*)"],
};
