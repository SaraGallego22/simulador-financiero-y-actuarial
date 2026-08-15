export interface TeamDayLink {
  href: string;
  label: string;
  short: string;
  day: number;
  actuarial: string;
  financiero: string;
}

/** Single source of truth for TeamNav's sidebar and the dashboard's day-block menu — keeps both in sync instead of maintaining two lists. */
export const TEAM_DAY_LINKS: TeamDayLink[] = [
  {
    href: "/day/1",
    label: "Día 1",
    short: "D1",
    day: 1,
    actuarial: "Tarificas cada póliza del 2027 antes de que el mercado se cierre.",
    financiero: "Presentas un portafolio de mínima varianza sujeto a un rendimiento objetivo.",
  },
  {
    href: "/day/2",
    label: "Día 2",
    short: "D2",
    day: 2,
    actuarial: "Retarificas para el 2028 (con retención de clientes) y reportas el estado de resultados del 2027.",
    financiero: "Armas el calendario de decisiones de tu portafolio de inversión real.",
  },
  {
    href: "/day/3",
    label: "Día 3",
    short: "D3",
    day: 3,
    actuarial: "Reportas las reservas técnicas de 2027 y 2028.",
    financiero: "Reportas el estado de resultados del 2028, la proyección del 2029 y el Balance completo.",
  },
  {
    href: "/day/4",
    label: "Día 4",
    short: "D4",
    day: 4,
    actuarial: "Recomiendas sectores del mercado a crecer y a disminuir.",
    financiero: "Reportas solvencia (capital requerido, margen) y dividendos.",
  },
];
