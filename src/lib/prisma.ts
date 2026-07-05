import { PrismaClient } from "@prisma/client";
import { PrismaNeon } from "@prisma/adapter-neon";
import { neonConfig } from "@neondatabase/serverless";
import ws from "ws";

// Neon's free-tier compute suspends after inactivity and takes a moment to
// wake on the next query. The Neon serverless driver (WebSocket-based, not
// raw TCP) handles that wake-up far more gracefully than a plain `pg`
// connection — this is what actually fixed the "admin config stopped
// working" report, which was a cold-start connection failure, not a code bug.
neonConfig.webSocketConstructor = ws;

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

function createPrismaClient() {
  const adapter = new PrismaNeon({ connectionString: process.env.DATABASE_URL });
  return new PrismaClient({ adapter });
}

export const prisma = globalForPrisma.prisma ?? createPrismaClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
