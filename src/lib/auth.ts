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
      },
      async authorize(credentials) {
        const username = credentials?.username;
        const password = credentials?.password;
        if (typeof username !== "string" || typeof password !== "string") return null;

        const user = await prisma.user.findUnique({ where: { username } });
        if (!user) return null;

        const validPassword = await bcrypt.compare(password, user.passwordHash);
        if (!validPassword) return null;

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
