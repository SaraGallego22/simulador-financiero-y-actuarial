import type { Role } from "@prisma/client";
import type { DefaultSession } from "next-auth";

declare module "next-auth" {
  interface Session {
    user: {
      role: Role;
      teamId: string | null;
    } & DefaultSession["user"];
  }

  interface User {
    role: Role;
    teamId: string | null;
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    role: Role;
    teamId: string | null;
  }
}
