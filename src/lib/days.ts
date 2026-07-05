export const DAY_TITLES: Record<number, string> = {
  1: "Tarificación Año 1 y portafolio",
  2: "P&G Año 1 y retarifación Año 2",
  3: "P&G Año 2 (+proy. A3) y Balance",
  4: "Solvencia, dividendos y analítica",
};

// Qué toca hacer ese día — portado de la introducción de cada día en el
// prototipo legacy (Pasantia_SURA_v3_inversiones_dinamicas.html).
export const DAY_DESCRIPTIONS: Record<number, string> = {
  1: "Actuarial: tarifica el Año 1. Financiero: elige el portafolio de inversión (con base en Chile). Al cierre del día se corre la simulación.",
  2: "Actuarial: calcula reservas y retarifica el Año 2. Financiero: cierra el P&G del Año 1 y rebalancea el portafolio. Al cierre del día se corre la simulación del Año 2.",
  3: "Actuarial: calcula las reservas del Año 2. Financiero: cierra el P&G del Año 2, proyecta el Año 3 y consolida el Balance de los años 1-2.",
  4: "Financiero: calcula solvencia, RK, fondos propios y dividendos. Actuarial: entrega la analítica sectorial para el eventual Año 3.",
};

// Indicaciones puntuales por pestaña, complementarias al texto que ya
// explica cada formulario — solo donde el prototipo legacy (o las reglas
// del dominio) dan una instrucción que no está ya cubierta ahí, para no
// duplicar. Portado/adaptado de Pasantia_SURA_v3_inversiones_dinamicas.html
// (líneas ~885-887 sim Día 2, ~930 portafolio Día 2, ~1332/1338/3618
// reservas Día 3, constantes LR_ALTO/LR_BAJO analítica Día 4).
export const TAB_NOTES: Record<
  number,
  { sim?: string; portfolio?: string; deliverables?: string; analytics?: string }
> = {
  1: {
    sim: "Al cerrar el día se corre la simulación de mercado con la tarifa que subas: define cuántas pólizas gana tu equipo y con qué siniestralidad — la base de todo lo que viene después.",
  },
  2: {
    sim: "Ya conoces el resultado y el calce del Año 1. Ajusta tu modelo de tarificación con tu propio historial de siniestros —ahora es una variable adicional— y sube un nuevo CSV con id_expuesto,prima para los mismos 10.000.000 de expuestos.",
    portfolio:
      "El portafolio del Año 2 es opcional e independiente del Año 1: si no subes uno nuevo, el Año 2 sigue usando el que definiste en el Día 1.",
  },
  3: {
    deliverables:
      "Recalcula las reservas del Año 2 con la emergencia de siniestros del Año 1 (casos avisados durante 2028, incluidos en tu reporte descargable) y construye el P&G por año calendario, incorporando ese desarrollo.",
  },
  4: {
    analytics:
      "La analítica sectorial se califica por dirección: loss ratio alto (≥100%) → recomienda disminuir; loss ratio bajo (≤85%) → recomienda crecer.",
  },
};
