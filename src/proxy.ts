import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";

/**
 * Admin routes ADMIN_TH may reach — everything else under /admin is
 * ADMIN-only (see adminNavData.ts's `roles` on each nav section, kept in
 * sync by hand since this runs at the edge and can't import Prisma-adjacent
 * code). "/admin" itself is the general panel (its own page.tsx branches
 * content by role); "/admin/config" is reachable too but renders read-only
 * for ADMIN_TH — every mutating action behind it still calls requireAdmin()
 * (not requireAdminOrTH()), so this route-level allow is presentation-only,
 * not a write permission.
 */
function isAdminTHPath(pathname: string): boolean {
  return (
    pathname === "/admin" ||
    pathname === "/admin/config" ||
    pathname === "/admin/entrevista" ||
    pathname.startsWith("/admin/entrevista/") ||
    pathname.startsWith("/admin/actividad")
  );
}

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

  if (pathname.startsWith("/admin")) {
    const role = session.user.role;
    const allowed = role === "ADMIN" || (role === "ADMIN_TH" && isAdminTHPath(pathname));
    if (!allowed) return NextResponse.redirect(new URL("/", req.nextUrl));
  }

  return NextResponse.next();
});

export const config = {
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico|.*\\.(?:png|jpg|jpeg|svg|gif|webp|ico)$).*)"],
};
