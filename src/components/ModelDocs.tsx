const SECTIONS = [
  {
    title: "Universo y generación de datos",
    body: "1,000,000 pólizas de auto en Colombia, generadas de forma determinística a partir de una semilla (mismo seed = mismo universo, siempre). Cada póliza tiene 13 variables de riesgo (edad, zona, tipo de vehículo, antigüedad, kilometraje, historial de siniestros, valor asegurado, uso, parqueadero, educación, estrato, género, marca). La frecuencia de siniestro (λ) y la severidad media se calculan con un modelo GLM multiplicativo sobre esas variables, con algunas interacciones y variables «trampa» deliberadamente débiles. El dataset de Chile (100,000 pólizas, 3 años 2021-2023) sirve de referencia para calibrar el portafolio de inversión: mismo patrón de desarrollo de siniestros (curva de pagos a 3 años, 3 meses de rezago aviso→pago) que tendrá la cartera propia.",
  },
  {
    title: "Día 1 — Tarificación Año 1 y portafolio",
    body: "Cada equipo sube una tarifa (prima por póliza) para las 1,000,000 exposiciones. Al cierre se corre un mercado de elección discreta (modelo logit): cada asegurado elige la aseguradora que maximiza su utilidad (precio + ruido Gumbel escalado por inercia de marca), sujeto a un tope de cuota de mercado por equipo; el exceso de demanda se redistribuye entre los equipos con cupo disponible. Los siniestros y fechas del Año 1 ya están fijados desde la generación del universo — la simulación solo decide qué asegurador se queda con cada póliza. En paralelo, el equipo financiero arma su portafolio como un árbol de decisiones (basado en Chile): reparte 100 entre los instrumentos del menú y, para cada tramo, decide qué pasa cuando venza — mantenerlo en caja, repetirlo indefinidamente, o reasignarlo entre nuevos instrumentos, cada uno con su propia decisión futura. Esa decisión gobierna todo el ciclo (fondeo mensual, pago de siniestros avisados, reinversión de vencimientos), no solo el Día 1.",
  },
  {
    title: "Día 2 — P&G Año 1 y retarifación Año 2",
    body: "Con la cartera del Año 1 ya conocida (incluyendo su propio historial de siniestros como variable adicional), cada equipo sube una nueva tarifa para el Año 2. El Año 2 tiene sus propios siniestros (nuevas simulaciones, no una reutilización de los del Año 1: un año más de antigüedad del vehículo, e historial actualizado si hubo siniestro en el Año 1) y un mercado con retención: cada asegurado tiene un bono de fidelidad hacia su aseguradora actual (mientras más alto el factor de retención, más difícil que un equipo pierda un cliente por precio). El P&G del Año 1 se calcula con las reservas técnicas (ver Reservas) y el rendimiento del portafolio.",
  },
  {
    title: "Reservas e IBNR",
    body: "Al cierre del Año 1, no todos los siniestros ocurridos ya fueron avisados. El pago de un siniestro puntual sigue tres tramos consecutivos: (1) ocurrencia→aviso, un rezago lognormal (mediana ~20 días, cola hasta 730 días/~2 años); (2) aviso→primer pago, un rezago fijo de 3 meses; (3) desarrollo del pago en sí, repartido en 3 años desde ese primer pago (55%/30%/15% por año). Estos tramos se suman: un siniestro ocurrido tarde en el Año 1 con un aviso muy demorado puede seguir pagándose casi hasta el límite de la ventana simulada (48 meses desde la valoración — deliberadamente más holgada que los 3 años de desarrollo puro, para no cortar esa cola). La reserva se compone de reserva avisada (RSA, sobre siniestros ya reportados) más IBNR (Incurred But Not Reported, estimado a partir del patrón de desarrollo agregado del mercado, no de la experiencia propia de cada equipo). Al cierre del Año 2, el desarrollo real del Año 1 (cuánto de lo IBNR efectivamente emergió) se compara contra lo esperado — esa diferencia es la ganancia/pérdida de desarrollo del Año 2.",
  },
  {
    title: "Día 3 — P&G Año 2, Balance y proyección Año 3",
    body: "Con el desarrollo Año1→Año2 ya conocido, se cierra el P&G del Año 2 (siniestros del Año 2 + desarrollo de los del Año 1) y se arma un balance simplificado (caja, cuentas por cobrar/pagar, inversiones, patrimonio) para el Año 1 y el Año 2. El Año 3 no se simula — se proyecta aplicando una tasa de crecimiento fija sobre el resultado del Año 2, para dar visibilidad de tendencia sin abrir un tercer ciclo de mercado completo.",
  },
  {
    title: "Día 4 — Solvencia, dividendos y analítica sectorial",
    body: "El capital de solvencia requerido (RK) combina riesgo de suscripción (primas + reservas), riesgo financiero y riesgo operacional (sobre primas), agregados con una matriz de correlación (similar en espíritu a Solvencia II). El riesgo financiero ya no es un porcentaje plano sobre las inversiones: se escala por la volatilidad realmente realizada del portafolio del equipo, relativa al promedio del menú de instrumentos — un equipo que concentró su portafolio en acciones (el instrumento más volátil) paga un capital requerido mayor que uno con el mismo monto invertido en instrumentos más estables, sin importar el rendimiento nominal obtenido. El margen de solvencia es fondos propios (patrimonio) sobre RK; el dividendo sugerido es el excedente de fondos propios sobre el RK objetivo. Adicionalmente, cada equipo hace una recomendación de crecer/mantener/disminuir por segmento (zona, uso, edad, estrato), calificada contra el loss ratio real observado en cada segmento.",
  },
  {
    title: "Portafolio de inversión y ALM",
    body: "El menú de instrumentos tiene un verdadero trade-off riesgo/retorno, no solo distintos rendimientos: cada instrumento también tiene una volatilidad anualizada (desde 1% en caja/LIQ hasta 20% en acciones). El TES UVR (8 años) está calibrado como el mejor balance del menú — su indexación a inflación le da una volatilidad menor de la que su plazo nominal sugeriría — mientras que las acciones, pese a su 14% de rendimiento nominal (el más alto), quedan castigadas: su volatilidad es tan alta que su rendimiento ajustado por riesgo es el peor del menú, peor incluso que dejar la plata en caja. El equipo no hace una asignación estática: construye un árbol de decisiones — reparte 100 entre los instrumentos y, para cada tramo, decide qué pasa al vencer (mantener en caja, repetir indefinidamente, o reasignar entre nuevos instrumentos, cada uno con su propia decisión). LIQ y acciones no tienen plazo contractual propio, así que el equipo les fija un vencimiento personalizado. La simulación mensual (60 meses) lleva dos vistas del portafolio: un estado de caja de 6 columnas contra una Caja Mínima obligatoria cada mes, y una evolución del valor del portafolio (Saldo Inicial, Rendimiento devengado, Saldo Final). Solo «mantener en caja» hace que el dinero de una inversión vuelva a la fila de caja — «repetir»/«reasignar» nunca ayudan a la caja mientras sigan en ese ciclo, aunque sigan rindiendo (eso sí suma al saldo del portafolio). LIQ es la excepción: siempre se puede retirar para cubrir una brecha, sin importar su propio vencimiento; acciones, en cambio, quedan genuinamente ilíquidas hasta el suyo. La nota de Cumplimiento de Caja evalúa el match en todo el horizonte (brecha máxima + brecha promedio acumulada); la nota de Rendimiento está ajustada por la volatilidad realmente sostenida en el tiempo, no solo por el rendimiento nominal — perseguir acciones sin cuidar el riesgo sale caro en la nota y también en el capital de solvencia del Día 4.",
  },
];

export function ModelDocs() {
  return (
    <div className="flex flex-col gap-4">
      {SECTIONS.map((s) => (
        <div key={s.title} className="rounded-lg border border-[var(--color-brand-gray-light)] border-t-4 border-t-[var(--color-brand-blue-accent)] bg-[var(--color-brand-surface)] p-5">
          <h3 className="mb-2 font-[family-name:var(--font-condensed)] text-sm font-bold uppercase tracking-wide text-[var(--color-brand-blue-accent)]">
            {s.title}
          </h3>
          <p className="text-sm text-[var(--color-brand-text-secondary)]">{s.body}</p>
        </div>
      ))}
    </div>
  );
}
