export interface AdminNavLink {
  href: string;
  label: string;
  short: string;
  description: string;
}

export interface AdminNavSection {
  label: string;
  links: AdminNavLink[];
  /** "Talento Humano" groups the interview together with the 3 soft-skill activities under one disclosure/menu group, with its own sub-label. */
  subgroup?: { label: string; links: AdminNavLink[] };
  /** Which admin roles see this section — defaults to ADMIN-only when omitted. ADMIN_TH only ever sees the "Talento Humano" section. */
  roles?: readonly ("ADMIN" | "ADMIN_TH")[];
}

/** Single source of truth for AdminNav's sidebar accordion and the admin home menu grid — keeps both in sync instead of maintaining two link lists. */
export const ADMIN_NAV_SECTIONS: AdminNavSection[] = [
  {
    label: "Preparación",
    roles: ["ADMIN"],
    links: [
      { href: "/admin/universo", label: "Universo y dataset Chile", short: "UNI", description: "Genera el mercado sintético de Colombia y el dataset de referencia de Chile." },
      { href: "/admin/modelo", label: "Modelo técnico", short: "MOD", description: "Cómo funciona el motor: generación, mercado, reservas, finanzas y analítica." },
    ],
  },
  {
    label: "Reto por días",
    roles: ["ADMIN"],
    links: [
      { href: "/admin/day/1", label: "Día 1", short: "D1", description: "Tarificación 2027 y portafolio de mínima varianza." },
      { href: "/admin/day/2", label: "Día 2", short: "D2", description: "P&G 2027 y retarifación 2028." },
      { href: "/admin/day/3", label: "Día 3", short: "D3", description: "P&G 2028 y Balance." },
      { href: "/admin/day/4", label: "Día 4", short: "D4", description: "Solvencia, dividendos y analítica sectorial." },
      { href: "/admin/standings", label: "Consolidado final", short: "CON", description: "Ranking y nota final de todos los equipos." },
      { href: "/admin/config", label: "Configuración", short: "CFG", description: "Equipos, rúbrica y qué día está abierto para el cohorte." },
    ],
  },
  {
    label: "Talento Humano",
    roles: ["ADMIN_TH"],
    links: [{ href: "/admin/entrevista", label: "Entrevista individual", short: "ENT", description: "Notas y comentarios de la entrevista con TH." }],
    subgroup: {
      label: "Habilidades blandas",
      links: [
        { href: "/admin/actividad/1", label: "Actividad 1", short: "A1", description: "Evaluación de habilidades blandas — actividad 1." },
        { href: "/admin/actividad/2", label: "Actividad 2", short: "A2", description: "Evaluación de habilidades blandas — actividad 2." },
        { href: "/admin/actividad/3", label: "Actividad 3", short: "A3", description: "Evaluación de habilidades blandas — actividad 3." },
      ],
    },
  },
];

/** Sections visible to a given admin role — ADMIN sees everything (unset `roles` defaults to ADMIN-only), ADMIN_TH only "Talento Humano". */
export function navSectionsForRole(role: "ADMIN" | "ADMIN_TH"): AdminNavSection[] {
  return ADMIN_NAV_SECTIONS.filter((s) => (s.roles ?? ["ADMIN"]).includes(role));
}
