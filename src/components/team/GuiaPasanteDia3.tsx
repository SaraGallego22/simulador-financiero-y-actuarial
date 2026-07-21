import { InsumosEntregables, PreguntasAbiertas, FlowStep } from "./GuiaShared";

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

/** Vertical financial-statement template with real row labels (unlike the generic ALM tables of Día 2, these have known line items) and one blank input column per year, so it visually matches DeliverablesForm's grouped rendering. */
function StatementTemplate({ rowLabels, columns, emphasizedLabels, note }: { rowLabels: string[]; columns: string[]; emphasizedLabels?: string[]; note?: string }) {
  return (
    <div className="flex flex-col gap-1">
      <div className="overflow-x-auto">
        <table className="w-full border-collapse border border-[var(--color-brand-gray-light)] text-xs">
          <thead>
            <tr>
              <th className="border border-[var(--color-brand-gray-light)] bg-[var(--color-brand-blue-light)] px-2 py-1.5 text-left font-semibold text-[var(--color-brand-blue-accent)]">
                Línea
              </th>
              {columns.map((c) => (
                <th key={c} className="border border-[var(--color-brand-gray-light)] bg-[var(--color-brand-blue-light)] px-2 py-1.5 text-left font-semibold text-[var(--color-brand-blue-accent)]">
                  {c}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rowLabels.map((label) => (
              <tr key={label}>
                <td
                  className={`border border-[var(--color-brand-gray-light)] px-2 py-1.5 ${emphasizedLabels?.includes(label) ? "font-semibold" : ""}`}
                >
                  {label}
                </td>
                {columns.map((c) => (
                  <td key={c} className="h-8 border border-[var(--color-brand-gray-light)] px-2 py-1.5">
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

const PYG_A2_ROWS = [
  "Prima emitida",
  "RPND liberada (A1)",
  "RPND constituida",
  "Prima devengada",
  "Costo de siniestros",
  "Ajuste de siniestralidad (A1)",
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

// Año 3 no tiene línea de Ajuste de siniestralidad — esa línea corrige el
// propio Costo de Siniestros A1 que reportaste en Día 2, y no hay un día
// posterior a Día 3 donde corregir un eventual error de Día 3 (ver sección 4).
const PYG_A3_ROWS = [
  "Prima emitida (proy.)",
  "RPND liberada (A2)",
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

const BALANCE_ROWS = [
  "Caja",
  "Inversiones (valor del portafolio)",
  "Cuentas por cobrar",
  "Activos totales",
  "Reservas técnicas",
  "RPND",
  "Cuentas por pagar",
  "Pasivo total",
  "Patrimonio",
  "Pasivo + Patrimonio",
];

export function GuiaPasanteDia3() {
  return (
    <div className="flex flex-col gap-5 text-[var(--color-foreground)]">
      <header className="rounded-lg border-t-8 border-t-[var(--color-brand-blue)] bg-[var(--color-brand-surface)] p-6">
        <p className="text-xs font-semibold uppercase tracking-wide text-[var(--color-brand-blue-accent)]">Pasantía Técnica · Seguros SURA</p>
        <h1 className="mt-1 font-[family-name:var(--font-condensed)] text-3xl font-bold text-[var(--color-brand-blue)]">Guía del pasante</h1>
        <p className="mt-1 font-[family-name:var(--font-condensed)] text-lg font-semibold text-[var(--color-brand-blue-accent)]">
          Día 3 — Estado de resultados Año 2/3 (proy.) y Balance
        </p>
        <p className="mt-4 text-sm text-[var(--color-brand-text-secondary)]">
          Esta es tu herramienta principal para abordar el reto de hoy. Léela antes de construir tus estados financieros: te explica exactamente qué se
          va a calificar, con qué criterios, y qué conceptos debes tener en cuenta — sin resolverte el ejercicio.
        </p>
      </header>

      <InsumosEntregables
        insumos={[
          "Pagos reales del Año 2 sobre los siniestros del Año 1 (desarrollo) y los siniestros propios del Año 2.",
          "Capital comprometido acumulado y rendimiento real devengado por tu ALM real de Año 1/Año 2.",
          "Retención real de pólizas de Año 1 a Año 2, para proyectar el Año 3.",
        ]}
        entregables={[
          "Estado de resultados completo del Año 2 (15 líneas) y proyección del Año 3 (14 líneas).",
          "Balance de Año 1, Año 2 y Año 3 (10 líneas cada uno).",
          "Siniestros pagados en Año 2 (desglose de caja, no una línea del P&G).",
        ]}
      />

      <Section n="1" title="Contexto del día">
        <p>
          Ya conoces cuánto pagaste durante el Año 2 de los siniestros del Año 1 y cuánto sigue pendiente. Con eso, cierras el ciclo financiero completo
          de los dos años simulados y proyectas un tercero.
        </p>
        <ul className="list-disc pl-5">
          <li>
            <strong>Actuarial — reservas técnicas de Año 1 y Año 2.</strong> Las calculas y las entregas como la línea &ldquo;Reservas técnicas&rdquo;
            del Balance de cada año — siempre el saldo real de siniestralidad menos lo pagado hasta ese punto, nunca una estimación de mercado.
          </li>
          <li>
            <strong>Financiero — estados de resultados completos de Año 2 (15 líneas) y Año 3 proyectado (14 líneas).</strong> La misma estructura que
            reportaste para el Año 1 en Día 2, con dos diferencias: cada año libera la Reserva de Prima No Devengada que el año anterior constituyó
            (además de constituir la propia), y Año 2 además carga &ldquo;Ajuste de siniestralidad&rdquo; — la corrección de tu propio Costo de
            Siniestros A1 de Día 2 contra el costo real del Año 1 — como su propia línea; Año 3 no tiene esa última.
          </li>
          <li>
            <strong>Financiero — Balance de Año 1, Año 2 y Año 3.</strong> El mismo balance simplificado (caja, inversiones, cuentas por cobrar/pagar,
            reservas técnicas, Reserva de Prima No Devengada, patrimonio) para los tres años, terminando en el chequeo contable Pasivo + Patrimonio =
            Activos.
          </li>
        </ul>
      </Section>

      <Section n="2" title="Teoría necesaria">
        <p className="text-[13px] italic text-[var(--color-brand-text-secondary)]">
          El desarrollo exacto de tu propia cartera no se revela por adelantado — esta sección explica el método con el que se estima, no tu resultado.
        </p>

        <SubSection title="Reservas técnicas y desarrollo de siniestros (Chain Ladder / IBNR)" accent="act">
          <p>
            Un siniestro no se paga todo de una vez el día que ocurre — hay un proceso de aviso, ajuste y pago que puede tomar varios años, y una
            aseguradora necesita saber, en cualquier corte contable, cuánto le queda pendiente por pagar de lo que ya ocurrió (avisado o no). Esa
            estimación se llama reserva técnica, y el problema de estimarla se conoce como <em>reserving</em>.
          </p>
          <p>
            La familia de métodos más usada — Chain Ladder — organiza los pagos en un triángulo de desarrollo: filas por año de ocurrencia (el año en
            que pasó el siniestro), columnas por año de desarrollo (cuántos años han pasado desde que ocurrió) y cada celda es lo pagado acumulado de
            ese año de ocurrencia hasta ese punto de desarrollo. Con años de ocurrencia ya completamente desarrollados se calculan factores de
            desarrollo — cuánto crece típicamente lo pagado de un año de desarrollo al siguiente — y esos factores se aplican a los años todavía
            incompletos para proyectar cuánto falta por pagar. Lo que falta por pagar de siniestros que ya ocurrieron pero que la aseguradora todavía no
            conoce en detalle (o ni siquiera sabe que existen) se llama IBNR (<em>Incurred But Not Reported</em>) — la reserva total es la suma de lo ya
            avisado pendiente de pago más ese IBNR.
          </p>
        </SubSection>

        <SubSection title="Loss Ratio y por qué el Balance necesita reservas" accent="fin">
          <p>
            El Loss Ratio (siniestralidad sobre prima devengada) es el indicador más básico para juzgar si un libro de negocio es rentable en su
            actividad de suscripción, antes de gastos — un Loss Ratio consistentemente por encima de lo que la prima puede cubrir después de gastos y
            margen es la señal más temprana de que una tarifa está mal calibrada. Pero el Loss Ratio de un año no está completo hasta que se conoce el
            desarrollo final de sus siniestros: un año que parece rentable con los pagos conocidos a la fecha puede dejar de serlo si el desarrollo
            (Chain Ladder, arriba) revela que faltaba una porción importante por pagar.
          </p>
          <p>
            Esa es la razón por la que las reservas técnicas viven en el Balance, no en el estado de resultados: representan una obligación ya
            incurrida (afecta el costo de siniestros del año en que ocurrió el siniestro) pero todavía no pagada en efectivo — un pasivo, junto a la
            Reserva de Prima No Devengada y las cuentas por pagar. La identidad contable Activos = Pasivo + Patrimonio debe cumplirse en cada corte, y
            es también la forma más simple de verificar que las reservas se calcularon de forma consistente con el resto del Balance.
          </p>
        </SubSection>
      </Section>

      <Section n="3" title="Qué se te va a calificar">
        <SubSection title="Estado de resultados Año 2" accent="fin">
          <p>
            El costo de siniestros del Año 2 es, en <strong>base fecha de accidente</strong>, únicamente lo ocurrido dentro del Año 2 — nunca se mezcla
            con lo del Año 1 (eso ya se reconoció como costo en el P&G del Año 1 mismo, sin importar cuándo se avisara). Lo que sí es propio de este año
            es una línea aparte: <strong>Ajuste de siniestralidad (A1)</strong>, la diferencia entre el costo real del Año 1 y lo que tú mismo reportaste
            como Costo de Siniestros A1 en Día 2 — puede ser positivo (subestimaste tu propia siniestralidad) o negativo (la sobreestimaste). Resta junto
            al costo antes de llegar al Resultado Técnico, pero es conceptualmente distinto: no es costo de siniestros de Año 2, es la corrección de tu
            propia estimación de Día 2.
          </p>
          <p>
            Tu prima devengada del Año 2 tampoco es un 80% plano de tu prima emitida de este año: liberas el 100% de la Reserva de Prima No Devengada que
            constituiste en Año 1 y constituyes una nueva sobre tu prima emitida de Año 2 — si tu prima creció o bajó de un año a otro, lo liberado y lo
            constituido no se cancelan exactamente.
          </p>
          <p>
            El Resultado de inversiones es, otra vez, el ingreso real que tu árbol de portafolio devengó durante los 12 meses del Año 2 — esta corrida no
            empieza de cero, continúa exactamente donde terminó el Año 1 real (mismas posiciones abiertas, mismo capital comprometido acumulado).
          </p>
        </SubSection>

        <SubSection title="Estado de resultados Año 3 (proyectado)" accent="fin">
          <p>
            El Año 3 <strong>no se simula</strong> — no hay un tercer mercado ni un ALM propio. Pero tampoco es una sola tasa de crecimiento aplicada a
            todo: cada línea se proyecta con la lógica que le corresponde, no todas igual.
          </p>
          <p>
            La prima depende de cuántas pólizas conservas (retención) y cuántas ganas de nuevo — no de crecer el peso total de la prima de Año 2 por un
            porcentaje. El costo de siniestros de Año 3, a diferencia del de Año 2, es <strong>solo</strong> el siniestro propio de Año 3 proyectado —
            sin ninguna línea de ajuste de siniestralidad: lo que sigue pagándose de siniestros de Año 1/Año 2 ya se reconoció como costo en su propio año de
            accidente, así que no vuelve a aparecer aquí (sí sigue existiendo como saldo de reserva en el Balance, ver sección 5.3). Y el Resultado de
            inversiones ya no puede salir de una fórmula plana sobre la reserva: piensa en qué te dice tu propio ALM real de Año 2 sobre lo que tu
            portafolio efectivamente rindió, más allá de lo que su rendimiento nominal prometía. Ver sección 4 para cómo razonar cada pieza.
          </p>
        </SubSection>

        <SubSection title="Balance — Año 1, Año 2 y Año 3" accent="fin">
          <p>
            El mismo balance simplificado para los tres años, construido a partir del estado de resultados de cada uno: cuánta caja, cuentas por cobrar e
            inversiones tienes (activos), cuánto debes en reservas técnicas, Reserva de Prima No Devengada (RPND) y cuentas por pagar (pasivo), y qué te
            queda (patrimonio). La RPND es la misma cifra que ya calculaste en el estado de resultados de ese año (lo que constituiste sobre tu prima
            emitida) — aquí aparece como pasivo, junto a las reservas técnicas, no como un cargo del P&G. La última línea, Pasivo + Patrimonio, debe
            cuadrar exactamente con Activos totales — es la identidad contable básica, y una forma de verificar tu propio trabajo antes de enviarlo.
          </p>
          <p className="text-[13px] italic text-[var(--color-brand-text-secondary)]">
            Las reservas técnicas de cada año son siempre el saldo real por pagar (RSA + IBNR para el Año 1; lo pendiente de ambos orígenes al cierre
            del Año 2) — nunca una estimación de mercado, así que se reportan como una línea del Balance, no como un entregable aparte.
          </p>
        </SubSection>
      </Section>

      <Section n="4" title="Conceptos que debes aplicar">
        <p className="text-[13px] italic text-[var(--color-brand-text-secondary)]">
          Esto es una guía de razonamiento, no una receta — reconstruir la relación exacta entre estos conceptos es parte de lo que se evalúa que tu
          equipo entienda.
        </p>

        <SubSection title="Para el desarrollo de siniestros" accent="act">
          <ul className="list-disc pl-5">
            <li>
              <strong>Costo incurrido no es lo mismo que caja pagada.</strong> Un siniestro puede estar reconocido como costo (afecta tu resultado
              técnico) sin haberse pagado todavía.
            </li>
            <li>
              <strong>El costo de siniestros de cada año es siempre en base fecha de accidente — nunca mezcla años.</strong> El Costo de siniestros del
              Año 2 es únicamente lo ocurrido en el Año 2; la corrección de tu propio Costo de Siniestros A1 de Día 2 es una línea aparte, Ajuste de
              siniestralidad, no un componente del costo de Año 2. Son dos ideas distintas: cuánto costó lo que pasó este año, y qué tan buena fue tu
              propia estimación de siniestralidad del año anterior.
            </li>
          </ul>
        </SubSection>

        <SubSection title="Para la proyección del Año 3" accent="fin">
          <p className="text-[13px] italic text-[var(--color-brand-text-secondary)]">
            Sin un mercado real que simular, cada línea necesita su propia regla explícita y consistente — no una intuición libre, y no la misma regla
            para todas.
          </p>
          <ul className="list-disc pl-5">
            <li>
              <strong>La prima no crece sola — depende de cuántas pólizas conservas.</strong> Piensa en tu Año 3 como pólizas retenidas de Año 2 (a la
              misma tasa de retención que ya observaste de Año 1 a Año 2) más pólizas nuevas — no como un porcentaje aplicado al total de prima de Año 2.
            </li>
            <li>
              <strong>El costo de siniestros de Año 3 es solo el siniestro propio de Año 3 — sin ajuste de siniestralidad.</strong> A diferencia del
              Año 2, no hay una línea de Ajuste de siniestralidad aquí: no hay un día posterior a Día 3 donde corregir un eventual error de esta
              proyección. Y lo que sigue pagándose de siniestros de Año 1 y Año 2 (cada siniestro tiene 3 años de desarrollo, no 2 — repasa la sección 4
              de la guía de Día 2 si no la tienes fresca) ya se reconoció como costo en el P&G de su propio año de accidente, así que no se cuenta otra
              vez aquí — solo sigue existiendo como saldo de reserva en el Balance.
            </li>
            <li>
              <strong>Para proyectar el siniestro propio de Año 3, separa frecuencia de severidad.</strong> La frecuencia (cuántas pólizas de tu libro
              tienen siniestro) no tiene por qué cambiar de un año a otro sin razón — la severidad (cuánto cuesta cada siniestro) sí, por inflación. No
              las mezcles en una sola tasa de crecimiento.
            </li>
            <li>
              <strong>¿Qué tasa de inflación de siniestros usar?</strong> Ya la conoces — el mismo 9% anual que usaste para ajustar tu severidad de
              Año 2 aplica otra vez para proyectar Año 3. Puedes verificar que tu propia cartera se movió a ese ritmo comparando la severidad promedio
              de tus siniestros reales entre Año 1 y Año 2.
            </li>
            <li>
              <strong>El Resultado de inversiones ya no puede salir de una fórmula plana sobre la reserva.</strong> Piensa en lo que tu ALM real de Año 2
              efectivamente rindió (no lo que su árbol prometía rendir en teoría) — si tuviste que vender algo bajo presión o comprometer capital en
              Año 2, eso también debería pesar en tu proyección de Año 3, no desaparecer.
            </li>
          </ul>
        </SubSection>

        <SubSection title="Para el Balance" accent="fin">
          <p>
            Antes de reportar, verifica tu propia identidad contable: Activos = Pasivo + Patrimonio, para cada uno de los tres años por separado. Si no
            cuadra, el error está en cómo calculaste alguna de las líneas anteriores — no en la línea final.
          </p>
        </SubSection>

        <PreguntasAbiertas>
          <li>¿Qué pasaría con tu Balance si el desarrollo real de los siniestros del Año 1 hubiera sido más lento de lo esperado?</li>
          <li>¿Qué factores además de la retención de pólizas podrían justificar una proyección de Año 3 distinta a la que hiciste?</li>
          <li>
            Si tuvieras que explicarle a un inversionista por qué la utilidad neta y el flujo de caja de un mismo año pueden diferir tanto, ¿qué le
            dirías?
          </li>
        </PreguntasAbiertas>
      </Section>

      <Section n="5" title="Plantillas — cómo se construye y cómo alimenta el resultado">
        <p>
          Esta sección te muestra la <strong>estructura</strong> exacta que va a evaluar el motor, vacía, para que puedas planear tus estados en papel
          antes de subirlos en el formulario. Las líneas y su orden son las mismas que vas a ver en el formulario de entregables.
        </p>

        <FlowStep n="1" title="5.1 · Estado de resultados — Año 2">
          <StatementTemplate
            rowLabels={PYG_A2_ROWS}
            columns={["Año 2"]}
            emphasizedLabels={["Resultado Técnico", "Resultado Industrial", "Utilidad antes de impuestos", "Utilidad neta"]}
            note="RPND liberada (A1) = 20% × tu Prima emitida A1 (Día 2). RPND constituida = 20% × Prima emitida A2. Prima devengada = Prima emitida − RPND constituida + RPND liberada — un roll-forward genuino, no un 80% plano de la prima de este año. Gastos de adquisición/Comisiones/administrativos son 4%/15%/6% de la Prima emitida A2. Resultado Técnico = Prima devengada − Costo − Ajuste de siniestralidad − Gadq − Gcom. Resultado Industrial = Resultado Técnico − Gasto administrativo. Impuesto = 30% × max(0, Utilidad antes de impuestos) — nunca negativo."
          />
        </FlowStep>

        <FlowStep n="2" title="5.1b · Estado de resultados — Año 3 (proyectado)">
          <StatementTemplate
            rowLabels={PYG_A3_ROWS}
            columns={["Año 3 (proy.)"]}
            emphasizedLabels={["Resultado Técnico", "Resultado Industrial", "Utilidad antes de impuestos", "Utilidad neta"]}
            note="Misma estructura que Año 2, pero sin línea de Ajuste de siniestralidad (ver sección 4 para por qué) — RPND liberada aquí usa tu Prima emitida A2 de la tabla de arriba, no la de Día 2."
          />
        </FlowStep>

        <FlowStep n="3" title="5.2 · Nota — siniestros pagados (no es una línea del P&G)">
          <div className="rounded border border-[var(--color-brand-cyan-light)] bg-[var(--color-brand-cyan-light)] px-3 py-2">
            <p className="text-xs text-[var(--color-brand-text-secondary)]">
              Además del estado de resultados, reportas una cifra más para el Año 2: <strong>Siniestros pagados en A2</strong> (la caja efectivamente
              pagada durante el año, de ambos orígenes). No se suma ni se resta en el estado de resultados — es un desglose/auditoría de flujo de caja,
              distinto del costo incurrido (base contable) que ya reportaste en la sección 5.1.
            </p>
          </div>
        </FlowStep>

        <FlowStep n="4" title="5.3 · Balance — Año 1, Año 2 y Año 3 (proy.)">
          <StatementTemplate
            rowLabels={BALANCE_ROWS}
            columns={["Año 1", "Año 2", "Año 3 (proy.)"]}
            emphasizedLabels={["Activos totales", "Pasivo + Patrimonio"]}
            note="Caja/Cuentas por cobrar/Cuentas por pagar/RPND son 15%/7%/10%/20% de la Prima emitida de ese año (la de Año 1 la reportaste en Día 2). Pasivo total = Reservas técnicas + RPND + Cuentas por pagar. Pasivo + Patrimonio debe ser exactamente igual a Activos totales."
          />
        </FlowStep>

        <FlowStep n="5" title="5.4 · El camino completo, de tus decisiones a tu reporte" last>
          <div className="rounded border border-[var(--color-brand-gray-light)] p-3">
            <p className="text-sm">
              El costo real de siniestros del Año 1 (4) + tu árbol de portafolio de Día 2 → alimentan el estado de resultados del Año 2 (5.1) → que junto
              con la retención real de Año 2 y el rendimiento realmente devengado por tu ALM real, te da la proyección del Año 3 (5.1b, sin línea de Ajuste
              de siniestralidad) → cada año, junto con el capital comprometido de tu ALM real, te da el Balance de ese año (5.3).
            </p>
            <p className="mt-2 text-sm">
              Estas mismas cifras (Balance de cada año, Resultado técnico/de inversiones) siguen siendo relevantes en las etapas siguientes del
              ejercicio.
            </p>
          </div>
        </FlowStep>
      </Section>
    </div>
  );
}
