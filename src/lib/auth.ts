import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import type { Role } from "@prisma/client";
import { prisma } from "./prisma";

export const { handlers, auth, signIn, signOut } = NextAuth({
  // Deploys on Vercel preview URLs that change per-branch; trustHost lets
  // Auth.js infer the origin from the request instead of requiring a fixed
  // AUTH_URL (see CLAUDE.md §12 — no custom domain in this project).
  trustHost: true,
  session: { strategy: "jwt" },
  pages: { signIn: "/login" },
  providers: [
    Credentials({
      credentials: {
        username: { label: "Usuario", type: "text" },
        password: { label: "Contraseña", type: "password" },
        cohorte: { label: "Cohorte", type: "text" },
      },
      async authorize(credentials) {
        const username = credentials?.username;
        const password = credentials?.password;
        const cohorte = credentials?.cohorte;
        if (typeof username !== "string" || typeof password !== "string" || typeof cohorte !== "string") return null;

        // The cohort word ("demo", "2026") routes a TEAM login to that exact
        // cohort — see Cohort.loginSlug's doc comment. It's a hard gate for
        // TEAM accounts (below); for ADMIN/ADMIN_TH it only needs to resolve
        // to a real cohort, since those accounts aren't scoped to one.
        const cohort = await prisma.cohort.findUnique({ where: { loginSlug: cohorte.trim().toLowerCase() } });
        if (!cohort) return null;

        const user = await prisma.user.findUnique({ where: { username }, include: { team: true } });
        if (!user) return null;

        const validPassword = await bcrypt.compare(password, user.passwordHash);
        if (!validPassword) return null;

        if (user.role === "TEAM" && user.team?.cohortId !== cohort.id) return null;

        return {
          id: user.id,
          name: user.username,
          role: user.role,
          teamId: user.teamId,
        };
      },
    }),
  ],
  callbacks: {
    jwt({ token, user }) {
      if (user) {
        token.role = user.role;
        token.teamId = user.teamId;
      }
      return token;
    },
    session({ session, token }) {
      // The core callback's `token` param type doesn't always pick up the
      // next-auth/jwt module augmentation below, even though it's the same
      // JWT object at runtime — cast explicitly rather than fight the types.
      session.user.role = token.role as Role;
      session.user.teamId = token.teamId as string | null;
      return session;
    },
  },
});
