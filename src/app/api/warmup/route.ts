import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

/**
 * Cheap DB ping, called by the admin client right before a heavy route
 * (/api/simulation, /api/universe) so Neon's free-tier auto-suspended
 * compute wakes up in its own short-lived invocation instead of eating into
 * the expensive route's 300s budget — see CLAUDE.md §4.1 and the "Task
 * timed out after 300 seconds" incident this was added for. Auto-suspend
 * only triggers on idle time, never mid-query, so once the heavy route's
 * own connection is actively streaming data it's safe regardless of how
 * long that takes; this only closes the gap between page load (or a
 * previous attempt) and the click that fires the real request.
 */
export async function GET() {
  const session = await auth();
  if (!session || session.user.role !== "ADMIN") {
    return NextResponse.json({ error: "No autorizado" }, { status: 403 });
  }
  await prisma.cohort.count();
  return NextResponse.json({ ok: true });
}
