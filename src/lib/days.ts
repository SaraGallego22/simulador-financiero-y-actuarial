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
