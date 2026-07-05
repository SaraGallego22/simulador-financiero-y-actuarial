const SECTIONS = [
  {
    title: "Universo y generación de datos",
    body: "1,000,000 pólizas de auto en Colombia, generadas de forma determinística a partir de una semilla (mismo seed = mismo universo, siempre). Cada póliza tiene 13 variables de riesgo (edad, zona, tipo de vehículo, antigüedad, kilometraje, historial de siniestros, valor asegurado, uso, parqueadero, educación, estrato, género, marca). La frecuencia de siniestro (λ) y la severidad media se calculan con un modelo GLM multiplicativo sobre esas variables, con algunas interacciones y variables «trampa» deliberadamente débiles. El dataset de Chile (100,000 pólizas, 3 años 2021-2023) sirve de referencia para calibrar el portafolio de inversión: mismo patrón de desarrollo de siniestros (curva de pagos a 3 años, 3 meses de rezago aviso→pago) que tendrá la cartera propia.",
  },
  {
    title: "Día 1 — Tarificación Año 1 y portafolio",
    body: "Cada equipo sube una tarifa (prima por póliza) para las 1,000,000 exposiciones. Al cierre se corre un mercado de elección discreta (modelo logit): cada asegurado elige la aseguradora que maximiza su utilidad (precio + ruido Gumbel escalado por inercia de marca), sujeto a un tope de cuota de mercado por equipo; el exceso de demanda se redistribuye entre los equipos con cupo disponible. Los siniestros y fechas del Año 1 ya están fijados desde la generación del universo — la simulación solo decide qué asegurador se queda con cada póliza. En paralelo, el equipo financiero arma un portafolio de inversión (basado en Chile) que debe calzar la curva de pasivos: ese portafolio gobierna todo el ciclo (fondeo mensual, pago de siniestros avisados, reinversión de vencimientos), no es una decisión de un solo día.",
  },
  {
    title: "Día 2 — P&G Año 1 y retarifación Año 2",
    body: "Con la cartera del Año 1 ya conocida (incluyendo su propio historial de siniestros como variable adicional), cada equipo sube una nueva tarifa para el Año 2. El Año 2 tiene sus propios siniestros (nuevas simulaciones, no una reutilización de los del Año 1: un año más de antigüedad del vehículo, e historial actualizado si hubo siniestro en el Año 1) y un mercado con retención: cada asegurado tiene un bono de fidelidad hacia su aseguradora actual (mientras más alto el factor de retención, más difícil que un equipo pierda un cliente por precio). El P&G del Año 1 se calcula con las reservas técnicas (ver Reservas) y el rendimiento del portafolio.",
  },
  {
    title: "Reservas e IBNR",
    body: "Al cierre del Año 1, no todos los siniestros ocurridos ya fueron avisados — hay un rezago aviso→pago de meses. La reserva se compone de reserva avisada (RSA, sobre siniestros ya reportados) más IBNR (Incurred But Not Reported, estimado a partir del patrón de desarrollo agregado del mercado). El patrón de pagos usa un kernel acumulado de desarrollo (curva de Chile). Al cierre del Año 2, el desarrollo real del Año 1 (cuánto de lo IBNR efectivamente emergió) se compara contra lo esperado — esa diferencia es la ganancia/pérdida de desarrollo del Año 2.",
  },
  {
    title: "Día 3 — P&G Año 2, Balance y proyección Año 3",
    body: "Con el desarrollo Año1→Año2 ya conocido, se cierra el P&G del Año 2 (siniestros del Año 2 + desarrollo de los del Año 1) y se arma un balance simplificado (caja, cuentas por cobrar/pagar, inversiones, patrimonio) para el Año 1 y el Año 2. El Año 3 no se simula — se proyecta aplicando una tasa de crecimiento fija sobre el resultado del Año 2, para dar visibilidad de tendencia sin abrir un tercer ciclo de mercado completo.",
  },
  {
    title: "Día 4 — Solvencia, dividendos y analítica sectorial",
    body: "El capital de solvencia requerido (RK) combina riesgo de suscripción (primas + reservas), riesgo financiero (sobre las inversiones) y riesgo operacional (sobre primas), agregados con una matriz de correlación (similar en espíritu a Solvencia II). El margen de solvencia es fondos propios (patrimonio) sobre RK; el dividendo sugerido es el excedente de fondos propios sobre el RK objetivo. Adicionalmente, cada equipo hace una recomendación de crecer/mantener/disminuir por segmento (zona, uso, edad, estrato), calificada contra el loss ratio real observado en cada segmento.",
  },
  {
    title: "Portafolio de inversión y ALM",
    body: "El menú de instrumentos tiene distintos plazos y rendimientos. La nota ALM combina el rendimiento efectivo del portafolio con una penalización por descalce (cuánto la curva de vencimientos se aleja de cuándo realmente hay que pagar siniestros/reservas). Buen calce + buen rendimiento = nota alta; todo en un instrumento muy largo deja sin caja para pagar los primeros siniestros, todo en caja calza perfecto pero rinde poco.",
  },
];

export function ModelDocs() {
  return (
    <div className="flex flex-col gap-4">
      {SECTIONS.map((s) => (
        <div key={s.title} className="rounded-lg border border-[var(--color-brand-gray-light)] border-t-4 border-t-[var(--color-brand-blue)] bg-white p-5">
          <h3 className="mb-2 font-[family-name:var(--font-condensed)] text-sm font-bold uppercase tracking-wide text-[var(--color-brand-blue)]">
            {s.title}
          </h3>
          <p className="text-sm text-gray-600">{s.body}</p>
        </div>
      ))}
    </div>
  );
}
