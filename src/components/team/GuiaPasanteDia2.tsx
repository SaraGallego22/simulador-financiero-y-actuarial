import { INSTRUMENTS, displayYieldLabel } from "@/domain/finance/instruments";

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

/** Vertical financial-statement template with real row labels, matching how DeliverablesForm groups/renders these same lines. */
function StatementTemplate({ rowLabels, emphasizedLabels, note }: { rowLabels: string[]; emphasizedLabels?: string[]; note?: string }) {
  return (
    <div className="flex flex-col gap-1">
      <div className="overflow-x-auto">
        <table className="w-full border-collapse border border-[var(--color-brand-gray-light)] text-xs">
          <thead>
            <tr>
              <th className="border border-[var(--color-brand-gray-light)] bg-[var(--color-brand-blue-light)] px-2 py-1.5 text-left font-semibold text-[var(--color-brand-blue-accent)]">
                Línea
              </th>
              <th className="border border-[var(--color-brand-gray-light)] bg-[var(--color-brand-blue-light)] px-2 py-1.5 text-left font-semibold text-[var(--color-brand-blue-accent)]">
                Año 1
              </th>
            </tr>
          </thead>
          <tbody>
            {rowLabels.map((label) => (
              <tr key={label}>
                <td className={`border border-[var(--color-brand-gray-light)] px-2 py-1.5 ${emphasizedLabels?.includes(label) ? "font-semibold" : ""}`}>
                  {label}
                </td>
                <td className="h-8 border border-[var(--color-brand-gray-light)] px-2 py-1.5">&nbsp;</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {note && <p className="text-[11px] italic text-[var(--color-brand-text-secondary)]">{note}</p>}
    </div>
  );
}

const PYG_ROWS = [
  "Prima emitida",
  "RPND constituida",
  "Prima devengada",
  "Costo de siniestros",
  "Gastos de adquisición",
  "Comisiones",
  "Resultado Técnico",
  "Gastos administrativos",
  "Resultado Industrial",
  "Resultado de inversiones",
  "Utilidad antes de impuestos",
  "Impuesto",
  "Utilidad neta",
];

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

export function GuiaPasanteDia2() {
  return (
    <div className="flex flex-col gap-5 text-[var(--color-foreground)]">
      <header className="rounded-lg border-t-8 border-t-[var(--color-brand-blue)] bg-[var(--color-brand-surface)] p-6">
        <p className="text-xs font-semibold uppercase tracking-wide text-[var(--color-brand-blue-accent)]">Pasantía Técnica · Seguros SURA</p>
        <h1 className="mt-1 font-[family-name:var(--font-condensed)] text-3xl font-bold text-[var(--color-brand-blue)]">Guía del pasante</h1>
        <p className="mt-1 font-[family-name:var(--font-condensed)] text-lg font-semibold text-[var(--color-brand-blue-accent)]">
          Día 2 — P&G Año 1, retarifación Año 2 y portafolio real
        </p>
        <p className="mt-4 text-sm text-[var(--color-brand-text-secondary)]">
          Esta es tu herramienta principal para abordar el reto de hoy. Léela antes de construir tu árbol de portafolio: te explica exactamente qué se va
          a calificar, con qué criterios, y qué conceptos debes tener en cuenta para tomar buenas decisiones — sin resolverte el ejercicio.
        </p>
      </header>

      <Section n="1" title="Contexto del día">
        <p>
          Ya conoces el resultado real del Año 1 — cuántas pólizas ganaste, con qué siniestralidad, y cuánta prima realmente cobraste. Hoy tomas el árbol
          de decisión de tu portafolio de inversión real, ahora con esas cifras reales en la mano en vez de la incertidumbre del Día 1.
        </p>
        <ul className="list-disc pl-5">
          <li>
            <strong>Actuarial — retarifación Año 2.</strong> Ajustas tu modelo de tarificación para el Año 2, ahora con el historial de siniestros de cada
            póliza como variable adicional. Las reservas técnicas del Año 1 no se reportan hoy — van como una línea del Balance que entregas en Día 3.
          </li>
          <li>
            <strong>Financiero — el árbol de portafolio real.</strong> Repartes tu presupuesto entre los instrumentos disponibles (tabla en la sección 4)
            y, para cada uno, decides qué pasa cuando venza. Esta decisión se pone a prueba mes a mes, durante 60 meses simulados, y alimenta directamente
            tu nota de ALM de hoy y, más adelante, el Resultado de Inversiones, el Balance y la Solvencia que vas a reportar en los días siguientes. A
            diferencia del portafolio de mínima varianza de Día 1 (un ejercicio aparte, ya calificado), este árbol es tu decisión de inversión real.
          </li>
          <li>
            <strong>Financiero — estado de resultados completo del Año 1.</strong> Reportas las 13 líneas del P&G del Año 1 (prima emitida, la Reserva de
            Prima No Devengada que constituyes sobre ella, prima devengada, costo de siniestros, gastos, resultado técnico, resultado industrial,
            resultado de inversiones, utilidad antes de impuestos, impuesto y utilidad neta), en el mismo orden vertical de un estado de resultados real —
            ver sección 2.
          </li>
        </ul>
      </Section>

      <Section n="2" title="Qué se te va a calificar">
        <SubSection title="Estado de resultados Año 1" accent="fin">
          <p>
            Reporta cada línea del P&G del Año 1 — no solo el resultado final. El motor ya conoce tu prima real (lo que efectivamente cobraste en el
            mercado, después del racionamiento por capital/solvencia si aplicó) y tu siniestralidad real, en base <strong>fecha de accidente</strong>: es
            el costo total de lo ocurrido en el Año 1, sin importar cuándo se avise. Los gastos de adquisición y comisión son porcentajes fijos sobre la
            prima <strong>emitida</strong> (4%/15%); el administrativo también (6%), pero ya no resta dentro del Resultado Técnico — tiene su propia línea
            (Resultado Industrial, ver sección 4.1). Tu prima emitida no es lo mismo que tu prima devengada: reservas un 20% como Reserva de Prima No
            Devengada (RPND), la parte que todavía no has &ldquo;ganado&rdquo; — solo el 80% restante entra al Resultado Técnico como ingreso. El
            Resultado de inversiones es el ingreso real que tu árbol de portafolio (abajo) devengó durante los 12 meses del Año 1 — no una fórmula, el
            resultado de la simulación mes a mes.
          </p>
          <p>
            No todas las líneas se califican igual. Las que son puramente una fórmula de otras líneas que ya reportaste (RPND constituida, prima
            devengada, gastos, Resultado Técnico, Resultado Industrial, utilidad antes de impuestos, impuesto, utilidad neta) se califican contra lo que
            <strong> tú mismo</strong> reportaste en esas otras líneas, no contra la cifra real del motor — un solo error (por ejemplo, en tu costo de
            siniestros) no te va a costar puntos varias veces en cada línea que depende de él, siempre que hayas aplicado la fórmula correctamente sobre
            tu propio número. Solo prima emitida, costo de siniestros y resultado de inversiones son hechos/estimaciones genuinos, calificados contra la
            cifra real.
          </p>
        </SubSection>
        <SubSection title="Árbol de portafolio real (ALM)" accent="fin">
          <p>
            Construyes un árbol de decisiones de inversión: repartes tu presupuesto entre los instrumentos disponibles (tabla en la sección 4) y, para cada
            uno, decides qué pasa cuando venza — dejarlo en caja, repetirlo indefinidamente, o reasignarlo entre nuevos instrumentos (que a su vez tienen
            su propia decisión). El sistema simula, mes a mes durante 60 meses, cómo tu árbol enfrenta el flujo de caja real: primas que entran, siniestros
            y gastos que salen, vencimientos que regresan como caja, y lo que queda se reinvierte según tu árbol.
          </p>
          <p>
            Este es tu único árbol para toda la simulación: el mismo que sometes hoy es el que sigue invirtiendo la prima real del Año 2 más adelante — no
            vas a tener una segunda oportunidad de someter uno distinto. Piensa tu árbol pensando en ambos años, no solo en el Año 1.
          </p>
          <p>Tu nota (&ldquo;Calce ALM del portafolio&rdquo;) tiene 4 componentes, con estos pesos:</p>
          <ul className="list-disc pl-5">
            <li>
              <strong>Cumplimiento de Caja Mínima (35%)</strong> — qué tan poco tuviste que comprometer tu Capital Social para cubrir una caja
              insuficiente.
            </li>
            <li>
              <strong>Rendimiento ajustado por riesgo (35%)</strong> — tu rendimiento real simulado, descontado por la volatilidad de lo que mantuviste
              invertido y por qué tan concentrado quedó tu portafolio en un solo instrumento (ver sección 3).
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
          Esto es una guía de razonamiento, no una receta — la asignación óptima del portafolio es parte de lo que se evalúa que tu equipo descubra.
        </p>

        <SubSection title="Para el portafolio" accent="fin">
          <p>
            El menú de instrumentos (sección 4.2) tiene un trade-off real entre rendimiento y volatilidad — no asumas que el instrumento con el
            rendimiento nominal más alto es la mejor opción una vez ajustas por riesgo. Antes de construir tu árbol, considera:
          </p>
          <ul className="list-disc pl-5">
            <li>
              <strong>Relación rendimiento/riesgo, no solo rendimiento.</strong> Compara cuánto rendimiento adicional te da cada instrumento por cada
              punto extra de volatilidad que asumes frente a uno más conservador.
            </li>
            <li>
              <strong>Concentrar todo en un solo instrumento tiene un costo aparte de su volatilidad.</strong> Aunque sea el instrumento con mejor
              relación rendimiento/riesgo del menú, quedarte 100% en uno solo descuenta tu Rendimiento — repartir entre varios de los instrumentos con
              plazo propio (CDT90/TES1/TES3/TESUVR8) baja ese descuento, incluso si tu volatilidad promedio termina siendo parecida. LIQ no cuenta para
              este descuento (no es una apuesta concentrada, es tu colchón de liquidez). Este mismo criterio vuelve a aparecer el Día 4, dentro del
              cálculo de tu capital de riesgo — entender por qué tu nota de hoy bajó es lo que te va a permitir reproducir correctamente ese cálculo
              entonces.
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

      <Section n="4" title="Plantillas — cómo se construyen y cómo alimentan el resultado">
        <p>
          Esta sección te muestra la <strong>estructura</strong> exacta que va a evaluar el motor, vacía, para que puedas planear tu estado de resultados
          y tu árbol en papel antes de construirlos en los formularios. Las fórmulas de calificación que aparecen aquí son las mismas que vas a ver, ya
          resueltas con tus números, en los resultados objetivos después de guardar cada entregable.
        </p>

        <div>
          <p className="mb-1 text-xs font-semibold uppercase text-[var(--color-brand-text-secondary)]">4.1 · Estado de resultados — Año 1</p>
          <StatementTemplate
            rowLabels={PYG_ROWS}
            emphasizedLabels={["Resultado Técnico", "Resultado Industrial", "Utilidad antes de impuestos", "Utilidad neta"]}
            note="RPND constituida = 20% × Prima emitida. Prima devengada = Prima emitida − RPND constituida (80% exacto en Año 1, porque no hay un año anterior del que liberar nada — sí cambia a partir de Año 2, ver la guía de Día 3). Gastos de adquisición/Comisiones/administrativos son 4%/15%/6% de la prima emitida. Resultado Técnico = Prima devengada − Costo − Gadq − Gcom (sin el gasto administrativo). Resultado Industrial = Resultado Técnico − Gasto administrativo. Utilidad antes de impuestos = Resultado Industrial + Resultado de inversiones. Impuesto = 30% × máx(0, Utilidad antes de impuestos) — nunca negativo. Resultado de inversiones sale de tu árbol de portafolio (secciones 4.2-4.6), no de una fórmula aparte."
          />
        </div>

        <div>
          <p className="mb-1 text-xs font-semibold uppercase text-[var(--color-brand-text-secondary)]">4.2 · Instrumentos disponibles</p>
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
                    <td className="border border-[var(--color-brand-gray-light)] px-2 py-1.5">{displayYieldLabel(ins)}</td>
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
          <p className="mb-1 text-xs font-semibold uppercase text-[var(--color-brand-text-secondary)]">4.3 · Tu árbol de decisión — plantilla en blanco</p>
          <BlankTable
            headers={["Instrumento (del menú de 4.2)", "% asignado", "Vencimiento personalizado (solo LIQ/ACC)", "Al vencer, ¿qué haces?"]}
            rows={5}
            note='Si en "Al vencer, ¿qué haces?" elegiste reasignar, repite esta misma tabla para esa porción — el vencimiento de la nueva línea se cuenta desde el mes en que venció la anterior, no desde el mes 0. Los instrumentos con plazo propio (CDT90/TES1/TES3/TESUVR8) siempre vencen en su propio plazo; el vencimiento personalizado solo aplica a LIQ y ACC.'
          />
        </div>

        <div>
          <p className="mb-1 text-xs font-semibold uppercase text-[var(--color-brand-text-secondary)]">
            4.4 · Cómo se traduce tu árbol en caja, mes a mes — plantilla del estado de caja
          </p>
          <BlankTable
            headers={["Mes", "Caja Inicial", "Prima Cobrada", "Pago Siniestros", "Gastos", "Vencimientos en caja", "Inversión Neta", "Caja Final"]}
            rows={4}
            note="Caja Final = Caja Inicial + Prima Cobrada − Pago Siniestros − Gastos + Vencimientos en caja − Inversión Neta. El motor repite esta cuenta 60 veces (60 meses) aplicando tu árbol de la sección 4.3."
          />
          <p className="mt-2 rounded border border-[var(--color-brand-cyan-light)] bg-[var(--color-brand-cyan-light)] px-3 py-2 text-xs text-[var(--color-brand-text-secondary)]">
            <span className="font-semibold text-[var(--color-brand-blue-accent)]">Cómo se determina cuánto se invierte cada mes — </span>
            primero se calcula la Caja Disponible = Caja Inicial + Prima Cobrada − Pago Siniestros − Gastos + Vencimientos en caja. Esa Caja Disponible se
            compara contra la Caja Mínima obligatoria de ese mes (15% × [Prima Cobrada + Pago Siniestros]): si la excede, <strong>todo el excedente</strong>{" "}
            (Caja Disponible − Caja Mínima) es la Inversión Neta de ese mes, aplicada según tu árbol de la sección 4.3 — nunca es la Prima Cobrada cruda.
            La Caja Final nunca queda libre: siempre termina siendo exactamente esa Caja Mínima, ni un peso más ni menos. Si la Caja Disponible no alcanza a
            cubrirla, no hay nada que invertir ese mes — en su lugar se drena primero LIQ (sin costo), luego se vende el resto del portafolio empezando por
            lo menos volátil (penaliza tu nota de Venta forzada), y si aun así no alcanza, se compromete Capital Social (penaliza tu nota de Cumplimiento de
            Caja Mínima) — nunca se queda la Caja Mínima sin cubrir.
          </p>
          <p className="mt-2 rounded border border-[var(--color-brand-cyan-light)] bg-[var(--color-brand-cyan-light)] px-3 py-2 text-xs text-[var(--color-brand-text-secondary)]">
            <span className="font-semibold text-[var(--color-brand-blue-accent)]">Importante — </span>
            la Prima Cobrada que usa esta simulación (la que califica tu nota ALM de hoy) es <strong>ficticia</strong>: asume que cada mes entra exactamente
            1/12 de tu reserva total, ni más ni menos — no tu prima real, aunque ya la conozcas. Esto es intencional: el ejercicio evalúa la calidad de tu
            árbol de decisión de forma aislada, sin mezclarla con el resultado de tu tarifa (un equipo que tarificó mal no debería tener, solo por eso, una
            nota de ALM peor). Cuando reportes el P&G real, vas a necesitar razonar cómo cambiarían estas cifras con tu prima real — la plataforma no te lo
            resuelve, aunque te muestra ambas corridas lado a lado en los resultados objetivos.
          </p>
        </div>

        <div>
          <p className="mb-1 text-xs font-semibold uppercase text-[var(--color-brand-text-secondary)]">4.5 · Las 4 notas — plantilla de calificación</p>
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
            <ScoreCard
              label="Rendimiento ajustado por riesgo"
              weight="35%"
              formula="normalizado de (rendimiento efectivo simulado − 0.35 × volatilidad promedio realizada − 0.03 × concentración del portafolio [0 a 1, excluye LIQ])"
            />
            <ScoreCard label="Venta forzada de portafolio" weight="20%" formula="100 × (1 − severidad de lo vendido bajo presión, ponderada por volatilidad)" />
            <ScoreCard label="Liquidez" weight="10%" formula="100 × min(1, líquido disponible ÷ pagos esperados en los próximos 6 meses)" />
          </div>
        </div>

        <div className="rounded border border-[var(--color-brand-gray-light)] p-3">
          <p className="mb-1 text-xs font-semibold uppercase text-[var(--color-brand-text-secondary)]">4.6 · El camino completo, de tu decisión a tu nota</p>
          <p className="text-sm">
            Tu árbol (4.3) → se simula mes a mes contra la caja real (4.4) → sus resultados (capital comprometido, rendimiento, ventas forzadas, liquidez)
            alimentan las 4 notas (4.5) → esas 4 notas, ponderadas, son tu nota final de ALM de hoy.
          </p>
          <p className="mt-2 text-sm">
            Esa misma nota final NO es directamente lo que vas a reportar como Resultado de Inversiones en tu P&G — para ese entregable necesitas volver a
            razonar tu árbol, esta vez con tu prima real (la que ya conoces) en vez del supuesto de fondeo perfecto de esta plantilla. El objetivo de esta
            guía es que entiendas la mecánica completa desde ahora, para que ese siguiente paso sea un ajuste sobre algo que ya entiendes, no un ejercicio
            desde cero.
          </p>
        </div>
      </Section>
    </div>
  );
}
