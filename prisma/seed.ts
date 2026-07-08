import { PrismaClient } from "@prisma/client";
import { PrismaNeon } from "@prisma/adapter-neon";
import { neonConfig } from "@neondatabase/serverless";
import ws from "ws";
import bcrypt from "bcryptjs";
import { randomBytes } from "node:crypto";

// Same reasoning as src/lib/prisma.ts: a direct (non-adapter) connection
// goes over raw TCP on port 5432, which several ISPs/firewalls block
// outright — the Neon serverless driver instead tunnels over WebSocket
// (port 443), which behaves like normal HTTPS traffic and isn't blocked the
// same way. Without this, `npm run db:seed` fails with
// "Can't reach database server" even though the app itself connects fine.
neonConfig.webSocketConstructor = ws;
const adapter = new PrismaNeon({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

function randomPassword(): string {
  return randomBytes(9).toString("base64url");
}

async function main() {
  const adminUsername = process.env.SEED_ADMIN_USERNAME ?? "admin";
  const adminPassword = process.env.SEED_ADMIN_PASSWORD ?? randomPassword();

  const existingAdmin = await prisma.user.findUnique({ where: { username: adminUsername } });
  if (existingAdmin) {
    console.log(`Ya existe un usuario admin "${adminUsername}" — no se crea de nuevo.`);
  } else {
    await prisma.user.create({
      data: {
        username: adminUsername,
        passwordHash: await bcrypt.hash(adminPassword, 10),
        role: "ADMIN",
      },
    });
    console.log("Cuenta admin creada:");
    console.log(`  usuario:    ${adminUsername}`);
    console.log(`  contraseña: ${adminPassword}`);
    console.log("Guárdala ahora — no se vuelve a mostrar.");
  }

  const cohort = await prisma.cohort.upsert({
    where: { name: "Cohorte demo" },
    update: {},
    create: { name: "Cohorte demo", active: true },
  });

  const demoTeams = [
    { name: "Equipo 1", color: "#0033A0", username: "equipo1" },
    { name: "Equipo 2", color: "#00AEC7", username: "equipo2" },
  ];

  for (const t of demoTeams) {
    const team = await prisma.team.upsert({
      where: { cohortId_name: { cohortId: cohort.id, name: t.name } },
      update: {},
      create: { cohortId: cohort.id, name: t.name, color: t.color },
    });

    const existingTeamUser = await prisma.user.findUnique({ where: { username: t.username } });
    if (existingTeamUser) continue;

    const teamPassword = randomPassword();
    await prisma.user.create({
      data: {
        username: t.username,
        passwordHash: await bcrypt.hash(teamPassword, 10),
        role: "TEAM",
        teamId: team.id,
      },
    });
    console.log(`Cuenta de equipo creada: ${t.username} / ${teamPassword} (${t.name})`);
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
