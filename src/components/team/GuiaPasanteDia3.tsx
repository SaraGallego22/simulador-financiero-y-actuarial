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

const PYG_ROWS = [
  "Prima devengada",
  "Costo de siniestros",
  "Gastos de adquisición",
  "Comisiones",
  "Gastos administrativos",
  "Resultado técnico",
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

      <Section n="1" title="Contexto del día">
        <p>
          Ya conoces cómo emergió el desarrollo de siniestros del Año 1 durante el Año 2 — cuánto de lo que esperabas como IBNR realmente se convirtió en
          siniestros avisados. Con eso, cierras el ciclo financiero completo de los dos años simulados y proyectas un tercero.
        </p>
        <ul className="list-disc pl-5">
          <li>
            <strong>Actuarial — reservas técnicas de Año 1 y Año 2.</strong> Ya no se reportan aparte (eso era Día 2/3 en versiones anteriores del
            ejercicio) — hoy las calculas y las entregas como la línea &ldquo;Reservas técnicas&rdquo; del Balance de cada año.
          </li>
          <li>
            <strong>Financiero — estados de resultados completos de Año 2 y Año 3 (proyectado).</strong> Las mismas 10 líneas que reportaste para el Año
            1 en Día 2, ahora para el Año 2 (con el desarrollo de siniestros del Año 1 incorporado) y para una proyección del Año 3.
          </li>
          <li>
            <strong>Financiero — Balance de Año 1, Año 2 y Año 3.</strong> El mismo balance simplificado (caja, inversiones, cuentas por cobrar/pagar,
            reservas técnicas, patrimonio) para los tres años, terminando en el chequeo contable Pasivo + Patrimonio = Activos.
          </li>
        </ul>
      </Section>

      <Section n="2" title="Qué se te va a calificar">
        <SubSection title="Estado de resultados Año 2" accent="fin">
          <p>
            Igual que el Año 1, pero en <strong>base calendario</strong>: el costo de siniestros del Año 2 no es solo lo que ocurrió dentro del Año 2 —
            también incluye cuánto más (o menos) de lo esperado como IBNR del Año 1 terminó emergiendo realmente durante el Año 2. Esa diferencia puede
            ser positiva (te faltó reservar) o negativa (reservaste de más).
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
            porcentaje. El costo de siniestros de Año 3, igual que el de Año 2, tiene un componente de <strong>desarrollo</strong> (lo que sigue
            emergiendo de siniestros de años anteriores, esta vez de Año 1 y de Año 2 a la vez) más un componente de siniestros propios de Año 3 — ese sí
            hay que proyectarlo, porque todavía no existe. Y el Resultado de inversiones ya no puede salir de una fórmula plana sobre la reserva: piensa
            en qué te dice tu propio ALM real de Año 2 sobre lo que tu portafolio efectivamente rindió, más allá de lo que su rendimiento nominal
            prometía. Ver sección 3 para cómo razonar cada pieza.
          </p>
        </SubSection>

        <SubSection title="Balance — Año 1, Año 2 y Año 3" accent="fin">
          <p>
            El mismo balance simplificado para los tres años, construido a partir del estado de resultados de cada uno: cuánta caja, cuentas por cobrar e
            inversiones tienes (activos), cuánto debes en reservas técnicas y cuentas por pagar (pasivo), y qué te queda (patrimonio). La última línea,
            Pasivo + Patrimonio, debe cuadrar exactamente con Activos totales — es la identidad contable básica, y una forma de verificar tu propio
            trabajo antes de enviarlo.
          </p>
          <p className="text-[13px] italic text-[var(--color-brand-text-secondary)]">
            Las reservas técnicas de cada año son la misma cifra actuarial que ya viste en el motor (RSA + IBNR para el Año 1; lo pendiente de ambos
            orígenes al cierre del Año 2) — solo que ahora se reportan como una línea del Balance, no como un entregable aparte.
          </p>
        </SubSection>
      </Section>

      <Section n="3" title="Conceptos que debes aplicar">
        <p className="text-[13px] italic text-[var(--color-brand-text-secondary)]">
          Esto es una guía de razonamiento, no una receta — reconstruir la relación exacta entre estos conceptos es parte de lo que se evalúa que tu
          equipo entienda.
        </p>

        <SubSection title="Para el desarrollo de siniestros" accent="act">
          <ul className="list-disc pl-5">
            <li>
              <strong>Costo incurrido no es lo mismo que caja pagada.</strong> Un siniestro puede estar reconocido como costo (afecta tu resultado
              técnico) sin haberse pagado todavía — el desarrollo del Año 1 que emerge en el Año 2 es exactamente esa clase de ajuste: ya lo tenías
              reservado, ahora se vuelve un siniestro avisado real.
            </li>
            <li>
              <strong>El costo de siniestros del Año 2, en base calendario, tiene dos orígenes.</strong> Lo propio del Año 2 (pólizas con siniestro este
              año) más el ajuste por lo que realmente emergió del Año 1 frente a lo que esperabas — sumar solo uno de los dos te da un resultado técnico
              incompleto.
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
              <strong>El costo de siniestros de Año 3 también tiene desarrollo — de dos orígenes a la vez.</strong> Igual que el costo de Año 2 mezclaba
              lo propio de ese año con el desarrollo de Año 1, el de Año 3 mezcla lo propio de Año 3 con el desarrollo que todavía sigue emergiendo de
              Año 1 <em>y</em> de Año 2 (cada siniestro tiene 3 años de desarrollo, no 2 — repasa la sección 3 de la guía de Día 2 si no la tienes fresca).
              Solo la pieza de Año 3 propiamente dicha necesita proyectarse; el resto ya lo conoces.
            </li>
            <li>
              <strong>Para proyectar el siniestro propio de Año 3, separa frecuencia de severidad.</strong> La frecuencia (cuántas pólizas de tu libro
              tienen siniestro) no tiene por qué cambiar de un año a otro sin razón — la severidad (cuánto cuesta cada siniestro) sí, por inflación. No
              las mezcles en una sola tasa de crecimiento.
            </li>
            <li>
              <strong>¿Qué tasa de inflación de siniestros usar?</strong> No está publicada, pero es reconstruible: el dataset de Chile (Día 1) ahora
              tiene una tendencia real de severidad año a año, en UF — una unidad ya libre de inflación chilena, así que ese crecimiento es puro costo
              real (repuestos/mano de obra), no inflación disfrazada. Súmale tu propia estimación de la inflación general de Colombia (dato público) y
              deberías acercarte a la inflación de siniestros que el motor ya usó para llevar tu propio libro de Año 1 a Año 2 — compara la severidad
              promedio de tus siniestros reales entre esos dos años para verificarlo.
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
      </Section>

      <Section n="4" title="Plantillas — cómo se construye y cómo alimenta el resultado">
        <p>
          Esta sección te muestra la <strong>estructura</strong> exacta que va a evaluar el motor, vacía, para que puedas planear tus estados en papel
          antes de subirlos en el formulario. Las líneas y su orden son las mismas que vas a ver en el formulario de entregables.
        </p>

        <div>
          <p className="mb-1 text-xs font-semibold uppercase text-[var(--color-brand-text-secondary)]">
            4.1 · Estado de resultados — Año 2 y Año 3 (proyectado)
          </p>
          <StatementTemplate
            rowLabels={PYG_ROWS}
            columns={["Año 2", "Año 3 (proy.)"]}
            emphasizedLabels={["Resultado técnico", "Utilidad antes de impuestos", "Utilidad neta"]}
            note="Gastos de adquisición/Comisiones/Gastos administrativos son 10%/4%/6% de la prima devengada de ese año, igual que en Día 2. Impuesto = 30% × max(0, Utilidad antes de impuestos) — nunca negativo."
          />
        </div>

        <div className="rounded border border-[var(--color-brand-cyan-light)] bg-[var(--color-brand-cyan-light)] px-3 py-2">
          <p className="mb-1 text-xs font-semibold uppercase text-[var(--color-brand-text-secondary)]">
            4.2 · Nota — siniestros pagados y desarrollo (no son líneas del P&G)
          </p>
          <p className="text-xs text-[var(--color-brand-text-secondary)]">
            Además del estado de resultados, reportas dos cifras más para el Año 2: <strong>Siniestros pagados en A2</strong> (la caja efectivamente
            pagada durante el año, de ambos orígenes) y <strong>Desarrollo siniestros A1</strong> (cuánto de eso vino específicamente de la
            re-estimación del Año 1). Ninguna de las dos se suma o resta en el estado de resultados — son un desglose/auditoría de cómo llegaste al
            &ldquo;Costo de siniestros A2&rdquo; de la sección 4.1, no cifras adicionales.
          </p>
        </div>

        <div>
          <p className="mb-1 text-xs font-semibold uppercase text-[var(--color-brand-text-secondary)]">4.3 · Balance — Año 1, Año 2 y Año 3 (proy.)</p>
          <StatementTemplate
            rowLabels={BALANCE_ROWS}
            columns={["Año 1", "Año 2", "Año 3 (proy.)"]}
            emphasizedLabels={["Activos totales", "Pasivo + Patrimonio"]}
            note="Caja/Cuentas por cobrar/Cuentas por pagar son 15%/7%/10% de la prima devengada de ese año. Pasivo total = Reservas técnicas + Cuentas por pagar. Pasivo + Patrimonio debe ser exactamente igual a Activos totales."
          />
        </div>

        <div className="rounded border border-[var(--color-brand-gray-light)] p-3">
          <p className="mb-1 text-xs font-semibold uppercase text-[var(--color-brand-text-secondary)]">4.4 · El camino completo, de tus decisiones a tu reporte</p>
          <p className="text-sm">
            El desarrollo real de siniestros (3) + tu árbol de portafolio de Día 2 → alimentan el estado de resultados del Año 2 (4.1) → que junto con la
            retención real de Año 2, el desarrollo que sigue emergiendo de Año 1 y Año 2, y el rendimiento realmente devengado por tu ALM real, te da la
            proyección del Año 3 (4.1) → cada año, junto con el capital comprometido de tu ALM real, te da el Balance de ese año (4.3).
          </p>
          <p className="mt-2 text-sm">
            Estas mismas cifras (Balance de cada año, Resultado técnico/de inversiones) son las que alimentan la Solvencia y los dividendos que vas a
            reportar mañana en Día 4 — ver esa guía para el detalle completo.
          </p>
        </div>
      </Section>
    </div>
  );
}
