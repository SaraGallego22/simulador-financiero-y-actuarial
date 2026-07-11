export const DAY_TITLES: Record<number, string> = {
  1: "Tarificación Año 1 y mínima varianza",
  2: "P&G Año 1, retarifación Año 2 y portafolio",
  3: "P&G Año 2 (+proy. A3), Balance y rebalanceo",
  4: "Solvencia, dividendos y analítica",
};

// Qué toca hacer ese día — portado de la introducción de cada día en el
// prototipo legacy (Pasantia_SURA_v3_inversiones_dinamicas.html), con el
// portafolio ALM movido a Día 2/3 (ver README's market-clearing section).
export const DAY_DESCRIPTIONS: Record<number, string> = {
  1: "Actuarial: tarifica el Año 1. Financiero: encuentra el portafolio de mínima varianza (con base en Chile) sujeto a un retorno objetivo. Al cierre del día se corre la simulación.",
  2: "Actuarial: calcula reservas y retarifica el Año 2. Financiero: cierra el P&G del Año 1 y arma el árbol de decisión de tu portafolio real (ya conoces tus cifras reales de Año 1). Al cierre del día se corre la simulación del Año 2.",
  3: "Actuarial: calcula las reservas del Año 2. Financiero: cierra el P&G del Año 2, proyecta el Año 3, consolida el Balance de los años 1-2 y opcionalmente rebalancea tu portafolio para Año 2.",
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
    portfolio:
      "Este portafolio de mínima varianza es una decisión aparte del árbol de inversión real (que se somete en Día 2, junto con tus cifras reales de prima y siniestros) — es tu presentación al regulador antes de escribir una sola póliza.",
  },
  2: {
    sim: "Ya conoces el resultado y el calce del Año 1. Ajusta tu modelo de tarificación con tu propio historial de siniestros —ahora es una variable adicional— y sube un nuevo CSV con id_expuesto,prima para los mismos 10.000.000 de expuestos.",
    portfolio:
      "Ahora que ya conoces tus cifras reales de prima y siniestros del Año 1, arma el árbol de decisión de tu portafolio real — esta es la decisión que se califica como Nota ALM.",
  },
  3: {
    deliverables:
      "Recalcula las reservas del Año 2 con la emergencia de siniestros del Año 1 (casos avisados durante 2028, incluidos en tu reporte descargable) y construye el P&G por año calendario, incorporando ese desarrollo.",
    portfolio:
      "El rebalanceo del portafolio para Año 2 es opcional e independiente del Año 1: si no subes uno nuevo, el Año 2 sigue usando el árbol que definiste en el Día 2.",
  },
  4: {
    analytics:
      "Nombra sectores cruzando 2 variables (ej. Zona: urbana × Uso: comercial), no una sola — el mercado tiene interacciones reales que un segmento univariado no puede mostrar. Se califica por ranking contra la verdad del universo completo, que no ves directamente: acertar la dirección no basta, importa qué tan cerca quede tu prioridad de la real.",
  },
};
