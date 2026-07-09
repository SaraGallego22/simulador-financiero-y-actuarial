import { INSTRUMENTS } from "@/domain/finance/instruments";

function Section({ n, title, children }: { n: string; title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-lg border border-[var(--color-brand-gray-light)] border-t-4 border-t-[var(--color-brand-blue-accent)] bg-[var(--color-brand-surface)] p-5 print:break-inside-avoid">
      <h2 className="mb-3 font-[family-name:var(--font-condensed)] text-lg font-bold uppercase tracking-wide text-[var(--color-brand-blue-accent)]">
        {n} · {title}
      </h2>
      <div className="flex flex-col gap-3 text-sm text-[var(--color-foreground)]">{children}</div>
    </section>
  );
}

function SubSection({ title, accent, children }: { title: string; accent: "act" | "fin"; children: React.ReactNode }) {
  return (
    <div
      className={`rounded border-l-4 p-3 ${accent === "act" ? "border-l-[var(--color-brand-cyan)] bg-[var(--color-brand-cyan-light)]" : "border-l-[var(--color-brand-blue)] bg-[var(--color-brand-blue-light)]"}`}
    >
      <p className="mb-2 text-xs font-bold uppercase tracking-wide text-[var(--color-brand-blue-accent)]">
        {accent === "act" ? "Actuarial — " : "Financiero — "}
        {title}
      </p>
      <div className="flex flex-col gap-2 text-sm">{children}</div>
    </div>
  );
}

function BlankTable({ headers, rows, note }: { headers: string[]; rows: number; note?: string }) {
  return (
    <div className="flex flex-col gap-1">
      <div className="overflow-x-auto">
        <table className="w-full border-collapse border border-[var(--color-brand-gray-light)] text-xs">
          <thead>
            <tr>
              {headers.map((h) => (
                <th key={h} className="border border-[var(--color-brand-gray-light)] bg-[var(--color-brand-blue-light)] px-2 py-1.5 text-left font-semibold text-[var(--color-brand-blue-accent)]">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {Array.from({ length: rows }).map((_, i) => (
              <tr key={i}>
                {headers.map((h) => (
                  <td key={h} className="h-8 border border-[var(--color-brand-gray-light)] px-2 py-1.5">
                    &nbsp;
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {note && <p className="text-[11px] italic text-[var(--color-brand-text-secondary)]">{note}</p>}
    </div>
  );
}

function ScoreCard({ label, weight, formula }: { label: string; weight: string; formula: string }) {
  return (
    <div className="rounded border border-[var(--color-brand-gray-light)] p-2">
      <p className="text-xs text-[var(--color-brand-text-secondary)]">
        {label} <span className="font-semibold">({weight})</span>
      </p>
      <p className="my-1 flex h-8 items-center rounded border border-dashed border-[var(--color-brand-gray-light)] px-2 font-[family-name:var(--font-condensed)] text-lg font-bold text-[var(--color-brand-text-secondary)]">
        &nbsp;
      </p>
      <p className="text-[10px] italic text-[var(--color-brand-text-secondary)]">{formula}</p>
    </div>
  );
}

export function GuiaPasanteDia1() {
  return (
    <div className="flex flex-col gap-5 text-[var(--color-foreground)]">
      <header className="rounded-lg border-t-8 border-t-[var(--color-brand-blue)] bg-[var(--color-brand-surface)] p-6">
        <p className="text-xs font-semibold uppercase tracking-wide text-[var(--color-brand-blue-accent)]">Pasantía Técnica · Seguros SURA</p>
        <h1 className="mt-1 font-[family-name:var(--font-condensed)] text-3xl font-bold text-[var(--color-brand-blue)]">Guía del pasante</h1>
        <p className="mt-1 font-[family-name:var(--font-condensed)] text-lg font-semibold text-[var(--color-brand-blue-accent)]">
          Día 1 — Tarificación Año 1 y portafolio de inversión
        </p>
        <p className="mt-4 text-sm text-[var(--color-brand-text-secondary)]">
          Esta es tu herramienta principal para abordar el reto de hoy. Léela antes de subir tu tarifa o construir tu portafolio: te explica exactamente
          qué se va a calificar, con qué criterios, y qué conceptos debes tener en cuenta para tomar buenas decisiones — sin resolverte el ejercicio.
        </p>
      </header>

      <Section n="1" title="Contexto del día">
        <p>
          El reto simula 4 días de trabajo repartidos en 2 años de operación de una aseguradora de autos. Tu equipo compite contra los demás equipos del
          cohorte por una porción de un mercado sintético de 1.000.000 de pólizas de auto en Colombia — cada póliza tiene características de riesgo reales
          (edad del conductor, zona, tipo de vehículo, antigüedad, kilometraje, historial de siniestros, valor asegurado, uso, tipo de parqueadero, nivel
          educativo, estrato, género, marca).
        </p>
        <p>Hoy tomas dos decisiones independientes que definen el punto de partida de todo lo que sigue:</p>
        <ul className="list-disc pl-5">
          <li>
            <strong>Actuarial — la tarifa del Año 1.</strong> Fijas el precio de cada póliza. Al cerrar el día, todos los equipos entran a un mercado
            simultáneo: cada asegurado elige la aseguradora que más le conviene, y el resultado (cuántas pólizas ganaste, con qué nivel de riesgo) queda
            fijado para el resto del ejercicio — es la base de las reservas y el P&G que vas a calcular desde el Día 2.
          </li>
          <li>
            <strong>Financiero — el portafolio de inversión.</strong> Decides cómo invertir el dinero que va entrando por primas frente a las obligaciones
            (reservas) que se van generando. Esta decisión se pone a prueba mes a mes, durante 60 meses simulados, y alimenta directamente tu nota de ALM
            de hoy y, más adelante, el Resultado de Inversiones, el Balance y la Solvencia que vas a reportar en los días siguientes.
          </li>
        </ul>
        <p>
          Además de estos dos entregables objetivos (auto-calificados contra el motor de referencia), el evaluador también observa cómo tu equipo trabaja
          — comunicación, reparto de roles, calidad del razonamiento — como parte de una calificación subjetiva separada. Esta guía se enfoca en lo
          objetivo, que es lo que tiene una fórmula exacta que puedes anticipar.
        </p>
      </Section>

      <Section n="2" title="Qué se te va a calificar">
        <SubSection title="Tarifa Año 1" accent="act">
          <p>
            Debes subir un CSV con dos columnas — <code className="rounded bg-black/5 px-1">id_expuesto,prima</code> — con una prima para cada una de las
            1.000.000 exposiciones del universo público (descargable desde la pestaña de Simulación de este día).
          </p>
          <p>
            <strong>No existe una &ldquo;tarifa correcta&rdquo; única que debas adivinar.</strong> Al cierre del día se corre un mercado de elección: cada
            asegurado compara el precio que le ofrece cada equipo y elige racionalmente (con algo de ruido aleatorio y cierta inercia hacia su aseguradora
            actual), sujeto a un tope de cuota de mercado por equipo — ningún equipo puede quedarse con todo el mercado solo por ser el más barato; el
            exceso de demanda se redistribuye entre los equipos que todavía tienen cupo disponible.
          </p>
          <p>
            Tu nota actuarial del día depende de tu resultado técnico (prima cobrada − siniestros), comparado contra un desempeño de referencia que define
            el propio modelo — no contra el resultado de los demás equipos: un resultado técnico en cero (ni ganancia ni pérdida) da una nota de 50; por
            encima de cero la nota sube, por debajo baja. Precios muy altos pierden clientes (y con ellos, ingreso); precios muy bajos ganan volumen, pero
            pueden hundir el resultado técnico si atraen selectivamente el riesgo equivocado.
          </p>
          <p className="text-[13px] italic text-[var(--color-brand-text-secondary)]">
            Si tu equipo no alcanza a completar su tarifa a tiempo, la pestaña de Simulación tiene una opción de emergencia — &ldquo;Tercerizar
            tarifas&rdquo; — que contrata a una consultora chilena, sin experiencia en el mercado colombiano, para definirla por ustedes. Les permite seguir
            participando en el mercado de ese día; el costo de esa consultoría corre por cuenta del equipo, y el detalle de la tarifa asignada solo se
            revela una vez se publiquen los resultados de ese día. Aplica igual en el Año 2.
          </p>
        </SubSection>

        <SubSection title="Portafolio de inversión (ALM)" accent="fin">
          <p>
            Construyes un árbol de decisiones de inversión: repartes tu presupuesto entre los instrumentos disponibles (tabla en la sección 4) y, para cada
            uno, decides qué pasa cuando venza — dejarlo en caja, repetirlo indefinidamente, o reasignarlo entre nuevos instrumentos (que a su vez tienen
            su propia decisión). El sistema simula, mes a mes durante 60 meses, cómo tu árbol enfrenta el flujo de caja real: primas que entran, siniestros
            y gastos que salen, vencimientos que regresan como caja, y lo que queda se reinvierte según tu árbol.
          </p>
          <p>Tu nota (&ldquo;Calce ALM del portafolio&rdquo;) tiene 4 componentes, con estos pesos:</p>
          <ul className="list-disc pl-5">
            <li>
              <strong>Cumplimiento de Caja Mínima (35%)</strong> — qué tan poco tuviste que comprometer tu Capital Social para cubrir una caja
              insuficiente.
            </li>
            <li>
              <strong>Rendimiento ajustado por riesgo (35%)</strong> — tu rendimiento real simulado, descontado por la volatilidad de lo que mantuviste
              invertido.
            </li>
            <li>
              <strong>Venta forzada de portafolio (20%)</strong> — si tuviste que vender activos antes de tiempo bajo presión de caja, y qué tan
              volátil/riesgoso era lo que vendiste.
            </li>
            <li>
              <strong>Liquidez (10%)</strong> — qué tan cubiertos estabas en el corto plazo (próximos 6 meses) frente a tus pagos esperados.
            </li>
          </ul>
          <p>
            La sección 4 te da la plantilla exacta y las fórmulas de cada componente, para que puedas anticipar tu nota antes de enviar tu árbol, no solo
            leerla después.
          </p>
        </SubSection>
      </Section>

      <Section n="3" title="Conceptos que debes aplicar">
        <p className="text-[13px] italic text-[var(--color-brand-text-secondary)]">
          Esto es una guía de razonamiento, no una receta — el modelo exacto de riesgo y la asignación óptima del portafolio son parte de lo que se
          evalúa que tu equipo descubra.
        </p>

        <SubSection title="Para la tarifa" accent="act">
          <p>Antes de fijar precios, trabaja con dos preguntas clásicas de tarificación de seguros:</p>
          <ul className="list-disc pl-5">
            <li>
              <strong>¿Qué tan probable es que cada póliza tenga un siniestro, y qué tan costoso sería si lo tiene?</strong> El universo público te da 13
              variables de riesgo por póliza. No todas pesan igual — parte de tu trabajo es identificar cuáles combinan señal real de riesgo y cuáles no.
              El modelo exacto de frecuencia/severidad no se revela: se espera que lo estimes con criterio actuarial (frecuencia esperada × severidad
              esperada ≈ costo esperado por póliza), no que lo adivines a ciegas.
            </li>
            <li>
              <strong>¿Qué pasa si cobras lo mismo a todos, o casi lo mismo?</strong> Una tarifa plana es vulnerable a selección adversa: los clientes de
              menor riesgo encuentran mejores precios en otro equipo y se van, mientras te quedas desproporcionadamente con los de mayor riesgo — tu prima
              promedio deja de cubrir tu costo promedio real.
            </li>
            <li>
              <strong>Precio y volumen están en tensión, no son independientes.</strong> El mercado tiene un tope de cuota por equipo, así que no puedes
              ganar simplemente bajando el precio sin límite — y cada punto de prima por encima del mercado te cuesta clientes. Piensa en tu tarifa como
              una curva de trade-offs entre volumen y margen, no como un solo número a optimizar en el vacío.
            </li>
          </ul>
        </SubSection>

        <SubSection title="Para el portafolio" accent="fin">
          <p>
            El menú de instrumentos (sección 4.1) tiene un trade-off real entre rendimiento y volatilidad — no asumas que el instrumento con el
            rendimiento nominal más alto es la mejor opción una vez ajustas por riesgo. Antes de construir tu árbol, considera:
          </p>
          <ul className="list-disc pl-5">
            <li>
              <strong>Relación rendimiento/riesgo, no solo rendimiento.</strong> Compara cuánto rendimiento adicional te da cada instrumento por cada
              punto extra de volatilidad que asumes frente a uno más conservador.
            </li>
            <li>
              <strong>Nunca dependas de vender bajo presión.</strong> LIQ es el único instrumento que puedes retirar sin ninguna penalización — mantener
              algo de colchón ahí evita caer en venta forzada cuando falte caja en un mes puntual.
            </li>
            <li>
              <strong>Los vencimientos personalizados no son gratis de planear.</strong> LIQ y ACC no tienen plazo fijo — tú decides cuándo se te vuelve a
              preguntar qué hacer con ellos. Un vencimiento demasiado largo en el instrumento más volátil del menú te deja atrapado justo cuando podrías
              necesitar liquidez.
            </li>
            <li>
              <strong>Piensa en tu árbol completo, no solo en la primera decisión.</strong> Si reasignas un vencimiento hacia otro instrumento, esa nueva
              posición también vence en algún momento y también necesita una decisión — encadenar reasignaciones sin ninguna salida líquida puede parecer
              rentable en papel y fallar en la práctica.
            </li>
          </ul>
        </SubSection>
      </Section>

      <Section n="4" title="Plantilla del ALM — cómo se construye y cómo alimenta el resultado">
        <p>
          Esta sección te muestra la <strong>estructura</strong> exacta que va a evaluar el motor, vacía, para que puedas planear tu árbol en papel antes
          de construirlo en el formulario. Las fórmulas de calificación que aparecen aquí son las mismas que vas a ver, ya resueltas con tus números, en
          los resultados objetivos después de guardar tu portafolio.
        </p>

        <div>
          <p className="mb-1 text-xs font-semibold uppercase text-[var(--color-brand-text-secondary)]">4.1 · Instrumentos disponibles</p>
          <div className="overflow-x-auto">
            <table className="w-full border-collapse border border-[var(--color-brand-gray-light)] text-xs">
              <thead>
                <tr>
                  {["ID", "Instrumento", "Rendimiento EA", "Volatilidad anual", "Plazo", "Nota"].map((h) => (
                    <th
                      key={h}
                      className="border border-[var(--color-brand-gray-light)] bg-[var(--color-brand-blue-light)] px-2 py-1.5 text-left font-semibold text-[var(--color-brand-blue-accent)]"
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {INSTRUMENTS.map((ins) => (
                  <tr key={ins.id}>
                    <td className="border border-[var(--color-brand-gray-light)] px-2 py-1.5 font-mono">{ins.id}</td>
                    <td className="border border-[var(--color-brand-gray-light)] px-2 py-1.5">{ins.nombre}</td>
                    <td className="border border-[var(--color-brand-gray-light)] px-2 py-1.5">{(ins.yield * 100).toFixed(1)}%</td>
                    <td className="border border-[var(--color-brand-gray-light)] px-2 py-1.5">{(ins.volAnual * 100).toFixed(1)}%</td>
                    <td className="border border-[var(--color-brand-gray-light)] px-2 py-1.5">{ins.plazoM >= 400 ? "sin venc. fijo" : `${ins.plazoM} meses`}</td>
                    <td className="border border-[var(--color-brand-gray-light)] px-2 py-1.5 text-[var(--color-brand-text-secondary)]">{ins.nota}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div>
          <p className="mb-1 text-xs font-semibold uppercase text-[var(--color-brand-text-secondary)]">4.2 · Tu árbol de decisión — plantilla en blanco</p>
          <BlankTable
            headers={["Instrumento (del menú de 4.1)", "% asignado", "Vencimiento personalizado (solo LIQ/ACC)", "Al vencer, ¿qué haces?"]}
            rows={5}
            note='Si en "Al vencer, ¿qué haces?" elegiste reasignar, repite esta misma tabla para esa porción — el vencimiento de la nueva línea se cuenta desde el mes en que venció la anterior, no desde el mes 0. Los instrumentos con plazo propio (CDT90/TES1/TES3/TESUVR8) siempre vencen en su propio plazo; el vencimiento personalizado solo aplica a LIQ y ACC.'
          />
        </div>

        <div>
          <p className="mb-1 text-xs font-semibold uppercase text-[var(--color-brand-text-secondary)]">
            4.3 · Cómo se traduce tu árbol en caja, mes a mes — plantilla del estado de caja
          </p>
          <BlankTable
            headers={["Mes", "Caja Inicial", "Prima Cobrada", "Pago Siniestros", "Gastos", "Vencimientos en caja", "Inversión Neta", "Caja Final"]}
            rows={4}
            note="Caja Final = Caja Inicial + Prima Cobrada − Pago Siniestros − Gastos + Vencimientos en caja − Inversión Neta. El motor repite esta cuenta 60 veces (60 meses) aplicando tu árbol de la sección 4.2."
          />
          <p className="mt-2 rounded border border-[var(--color-brand-cyan-light)] bg-[var(--color-brand-cyan-light)] px-3 py-2 text-xs text-[var(--color-brand-text-secondary)]">
            <span className="font-semibold text-[var(--color-brand-blue-accent)]">Importante — </span>
            la Prima Cobrada que usa esta simulación (la que califica tu nota ALM de hoy) es <strong>ficticia</strong>: asume que cada mes entra exactamente
            1/12 de tu reserva total, ni más ni menos. Esto es intencional — todavía no sabes cuánta prima real vas a cobrar (eso lo decide el mercado que
            corre al cierre de hoy), así que este ejercicio evalúa la calidad de tu árbol de decisión de forma aislada, sin mezclarla con el resultado de
            tu tarifa. Más adelante, cuando reportes el P&G real, vas a necesitar razonar cómo cambiarían estas cifras con tu prima real — la plataforma no
            te lo resuelve.
          </p>
        </div>

        <div>
          <p className="mb-1 text-xs font-semibold uppercase text-[var(--color-brand-text-secondary)]">4.4 · Las 4 notas — plantilla de calificación</p>
          <div className="rounded border border-[var(--color-brand-blue-accent)] bg-[var(--color-brand-blue-light)] p-3">
            <p className="text-xs uppercase text-[var(--color-brand-text-secondary)]">Nota final del ALM</p>
            <p className="my-1 flex h-9 w-28 items-center justify-center rounded border border-dashed border-[var(--color-brand-blue-accent)] font-[family-name:var(--font-condensed)] text-lg font-bold text-[var(--color-brand-text-secondary)]">
              &nbsp;
            </p>
            <p className="text-xs italic text-[var(--color-brand-text-secondary)]">
              = 35% × Cumplimiento de Caja + 35% × Rendimiento ajustado + 20% × Venta forzada + 10% × Liquidez
            </p>
          </div>
          <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4">
            <ScoreCard label="Cumplimiento de Caja Mínima" weight="35%" formula="100 × (1 − 0.5×[peor mes de capital comprometido ÷ Capital Social] − 0.5×[acumulado ÷ Capital Social])" />
            <ScoreCard label="Rendimiento ajustado por riesgo" weight="35%" formula="normalizado de (rendimiento efectivo simulado − 0.35 × volatilidad promedio realizada)" />
            <ScoreCard label="Venta forzada de portafolio" weight="20%" formula="100 × (1 − severidad de lo vendido bajo presión, ponderada por volatilidad)" />
            <ScoreCard label="Liquidez" weight="10%" formula="100 × min(1, líquido disponible ÷ pagos esperados en los próximos 6 meses)" />
          </div>
        </div>

        <div className="rounded border border-[var(--color-brand-gray-light)] p-3">
          <p className="mb-1 text-xs font-semibold uppercase text-[var(--color-brand-text-secondary)]">4.5 · El camino completo, de tu decisión a tu nota</p>
          <p className="text-sm">
            Tu árbol (4.2) → se simula mes a mes contra la caja real (4.3) → sus resultados (capital comprometido, rendimiento, ventas forzadas, liquidez)
            alimentan las 4 notas (4.4) → esas 4 notas, ponderadas, son tu nota final de ALM del Día 1.
          </p>
          <p className="mt-2 text-sm">
            Esa misma nota final NO es directamente lo que vas a reportar como Resultado de Inversiones en el P&G del Día 2 — para ese entregable necesitas
            volver a razonar tu árbol, esta vez con tu prima real (la que ganaste en el mercado de hoy) en vez del supuesto de fondeo perfecto de esta
            plantilla. El objetivo de esta guía es que entiendas la mecánica completa desde ahora, para que ese siguiente paso sea un ajuste sobre algo que
            ya entiendes, no un ejercicio desde cero.
          </p>
        </div>
      </Section>
    </div>
  );
}
