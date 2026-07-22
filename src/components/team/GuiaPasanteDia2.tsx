import { INSTRUMENTS, displayYieldLabel } from "@/domain/finance/instruments";
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
function StatementTemplate({ rowLabels, emphasizedLabels, formulaNotes }: { rowLabels: string[]; emphasizedLabels?: string[]; formulaNotes?: string[] }) {
  return (
    <div className="flex flex-col gap-3">
      <div className="overflow-x-auto">
        <table className="w-full border-collapse border border-[var(--color-brand-gray-light)] text-xs">
          <thead>
            <tr>
              <th className="border border-[var(--color-brand-gray-light)] bg-[var(--color-brand-blue-light)] px-2 py-1.5 text-left font-semibold text-[var(--color-brand-blue-accent)]">
                Línea
              </th>
              <th className="border border-[var(--color-brand-gray-light)] bg-[var(--color-brand-blue-light)] px-2 py-1.5 text-left font-semibold text-[var(--color-brand-blue-accent)]">
                2027
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
      {formulaNotes && <FormulaNotes lines={formulaNotes} />}
    </div>
  );
}

/** Formula reference notes, one per line with real spacing between them — replaces cramming every formula into one dense paragraph. */
function FormulaNotes({ lines }: { lines: string[] }) {
  return (
    <div className="flex flex-col gap-2.5 rounded border border-[var(--color-brand-gray-light)] bg-[var(--color-brand-blue-light)]/40 p-3">
      {lines.map((line, i) => (
        <p key={i} className="text-xs leading-relaxed text-[var(--color-brand-text-secondary)]">
          {line}
        </p>
      ))}
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
    <div className="flex flex-col gap-2 rounded border border-[var(--color-brand-gray-light)] p-3">
      <p className="text-xs text-[var(--color-brand-text-secondary)]">
        {label} <span className="font-semibold">({weight})</span>
      </p>
      <p className="flex h-9 items-center rounded border border-dashed border-[var(--color-brand-gray-light)] px-2 font-[family-name:var(--font-condensed)] text-lg font-bold text-[var(--color-brand-text-secondary)]">
        &nbsp;
      </p>
      <p className="text-xs leading-relaxed text-[var(--color-brand-text-secondary)]">{formula}</p>
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
          Día 2 — P&G 2027, retarifación 2028 y portafolio real
        </p>
        <p className="mt-4 text-sm text-[var(--color-brand-text-secondary)]">
          Esta es tu herramienta principal para abordar el reto de hoy. Léela antes de construir tu árbol de portafolio: te explica exactamente qué se
          va a calificar, con qué criterios, y qué conceptos debes tener en cuenta para tomar buenas decisiones — sin resolverte el ejercicio.
        </p>
      </header>

      <InsumosEntregables
        insumos={[
          "Resultado real del mercado del 2027: pólizas ganadas y prima cobrada de tu propia cartera.",
          "Historial de siniestros por póliza avisados hasta la fecha (algunos siniestros de 2027 todavía no se han avisado — la misma opacidad de IBNR de Día 1) — insumo para la retarifación de 2028 y para estimar tu Costo de Siniestros A1.",
          "Menú de 6 instrumentos financieros y su matriz de covarianza, para tu árbol de portafolio real.",
        ]}
        entregables={[
          "Tarifa 2028 (mismo formato CSV que Día 1: id_expuesto, prima).",
          "Árbol de decisión de portafolio real (instrumento, % asignado, vencimiento/reasignación).",
          "Estado de resultados completo del 2027 (13 líneas).",
        ]}
      />

      <Section n="1" title="Contexto del día">
        <p>
          Ya conoces el resultado real del 2027 — cuántas pólizas ganaste, con qué siniestralidad, y cuánta prima realmente cobraste. Hoy tomas el árbol
          de decisión de tu portafolio de inversión real, ahora con esas cifras reales en la mano en vez de la incertidumbre del Día 1.
        </p>
        <ul className="list-disc pl-5">
          <li>
            <strong>Actuarial — retarifación 2028 y costo de siniestros 2027.</strong> Ajustas tu modelo de tarificación para el 2028, ahora con el
            historial de siniestros avisados de cada póliza como variable adicional. También estimas el costo de siniestros del 2027 para tu P&G — no
            todos esos siniestros se han avisado todavía, así que no es una simple suma (ver sección 2). Las reservas técnicas del 2027 no se
            reportan hoy — se calculan y reportan más adelante en el ejercicio.
          </li>
          <li>
            <strong>Financiero — el árbol de portafolio real.</strong> Repartes tu presupuesto entre los instrumentos disponibles (tabla en la sección 5)
            y, para cada uno, decides qué pasa cuando venza. Esta decisión se pone a prueba mes a mes, durante 60 meses simulados, y alimenta directamente
            tu nota de ALM de hoy y, más adelante, el Resultado de Inversiones, el Balance y la Solvencia que vas a reportar en los días siguientes. A
            diferencia del portafolio de mínima varianza de Día 1 (un ejercicio aparte, ya calificado), este árbol es tu decisión de inversión real.
          </li>
          <li>
            <strong>Financiero — estado de resultados completo del 2027.</strong> Reportas las 13 líneas del P&G del 2027 (prima emitida, la Reserva de
            Prima No Devengada que constituyes sobre ella, prima devengada, costo de siniestros, gastos, resultado técnico, resultado industrial,
            resultado de inversiones, utilidad antes de impuestos, impuesto y utilidad neta), en el mismo orden vertical de un estado de resultados real —
            ver sección 3.
          </li>
        </ul>
      </Section>

      <Section n="2" title="Teoría necesaria">
        <p className="text-[13px] italic text-[var(--color-brand-text-secondary)]">
          El ajuste exacto de tu tarifa y la asignación óptima de tu árbol no se revelan — esta sección explica el marco conceptual, no la respuesta.
        </p>

        <SubSection title="Retarifar con un año de experiencia real" accent="act">
          <p>
            Ya no estás tarificando a ciegas: tienes un año de experiencia real por póliza — los siniestros ya avisados, con su magnitud — que no
            tenías antes. No es la foto completa todavía (algunos siniestros del 2027 siguen sin avisarse, la misma opacidad de IBNR que ya viste en
            Día 1), pero sigue siendo información real que no tenías al tarificar por primera vez. Hay más de un camino razonable para aprovecharla,
            y ninguno es obligatorio:
          </p>
          <ul className="list-disc pl-5">
            <li>
              <strong>Revisar y corregir tu propio modelo de tarifa.</strong> Compara tu frecuencia/severidad estimada contra lo que realmente ocurrió
              — si alguna variable no predijo bien, o si tu tarifa quedó sistemáticamente alta o baja frente a la siniestralidad real, este es el
              momento de mejorar esa misma estimación con evidencia real, sin necesariamente cambiar de método.
            </li>
            <li>
              <strong>Incorporar la experiencia individual de cada póliza, no solo la de su clase de riesgo.</strong> Aquí es donde entra la teoría de
              credibilidad: formaliza cómo mezclar la experiencia propia de un asegurado con el promedio de su clase — la prima ajustada es un
              promedio ponderado entre las dos, donde el peso de la experiencia propia (el &ldquo;factor de credibilidad&rdquo;, entre 0 y 1) crece
              cuanto mayor sea el volumen de experiencia acumulada y menor su varianza frente a la varianza entre clases. Es un camino más
              sofisticado, no el único válido — un solo año de historial por póliza es poca información, y cuánta credibilidad le asignes es una
              decisión de criterio.
            </li>
          </ul>
          <p>
            Cualquiera de los dos caminos (o una combinación de ambos) es una respuesta legítima — lo que se evalúa es que tu retarifación use la
            información real que ya tienes, no que sigas un método específico.
          </p>
          <p>
            <strong>Inflación del costo de siniestros.</strong> Además de tu propia experiencia, hay un factor que cualquier aseguradora real enfrenta
            año a año: reparar un vehículo o reemplazar sus partes cuesta más en términos nominales con el paso del tiempo — por inflación general de
            la economía, y por presiones propias del sector (repuestos, mano de obra especializada, disponibilidad de talleres) que pueden moverse a
            un ritmo distinto de esa inflación general. Una aseguradora que tarifica un año con el costo promedio del año anterior, sin ajustar por
            esto, sistemáticamente subestima lo que en realidad va a pagar.
          </p>
          <p>
            La inflación general esperada entre el 2027 y el 2028 es del <strong>6% anual</strong> — tenla de referencia. La inflación del costo de
            siniestros específicamente es <strong>mayor</strong> a esa inflación general (por las presiones propias del sector que ya mencionamos):
            no se te da el número exacto, es parte de lo que se evalúa que tu equipo estime al ajustar su severidad para la tarifa de este año.
          </p>
        </SubSection>

        <SubSection title="Estimar el costo de siniestros de 2027: Expected Loss Ratio" accent="act">
          <p>
            El costo de siniestros que reportas en tu P&G del 2027 (sección 3) ya no es una simple suma de lo que ves en tu reporte — igual que en
            Día 1, solo ves los siniestros que ya se avisaron a la fecha; el resto sigue siendo IBNR (Incurred But Not Reported). Con un solo año de
            experiencia todavía no existe un triángulo de desarrollo real que triangular (eso solo aparece a partir de Día 3, cuando ya hay pagos del
            2027 dentro del 2028) — así que Chain Ladder no es una opción todavía. El método apropiado para esta madurez es el{" "}
            <strong>Expected Loss Ratio (ELR)</strong>.
          </p>
          <p>
            El método ELR estima el costo <strong>último</strong> — no solo lo avisado — como un porcentaje asumido de la prima, en vez de partir de
            tu propia experiencia real, precisamente porque un solo año inmaduro no es lo bastante creíble por sí solo:
          </p>
          <div className="rounded border border-[var(--color-brand-blue-accent)] bg-[var(--color-brand-blue-light)] p-4 text-center">
            <p className="font-[family-name:var(--font-condensed)] text-base font-bold text-[var(--color-brand-blue-accent)] sm:text-lg">
              Costo Último = Loss Ratio Esperado × Prima Devengada
            </p>
          </div>
          <p>
            <strong>¿De dónde sale tu propio Loss Ratio Esperado?</strong> No de una fórmula genérica igual para todo el cohorte — de tu propio
            modelo de frecuencia × severidad de Día 1, aplicado a las pólizas que <strong>realmente ganaste</strong> (no al universo completo): ya
            estimaste una prima pura para cada una de ellas cuando tarificaste. La razón entre esa prima pura que tú mismo estimaste para tu
            propio libro y la prima que realmente cobraste por él es tu Loss Ratio Esperado — específico de tu cartera y de tu propio modelo, no
            un número compartido por todo el cohorte:
          </p>
          <div className="rounded border border-[var(--color-brand-blue-accent)] bg-[var(--color-brand-blue-light)] p-4 text-center">
            <p className="font-[family-name:var(--font-condensed)] text-sm font-bold text-[var(--color-brand-blue-accent)] sm:text-base">
              Loss Ratio Esperado (propio) = Σ Prima Pura estimada (pólizas ganadas) ÷ Σ Prima cobrada (pólizas ganadas)
            </p>
          </div>
          <p>
            Si tarificaste con la fórmula de referencia de Día 1 de forma uniforme para todo tu libro (Prima Comercial = Prima Pura ÷ (1 − %
            Gastos − % Utilidad), con 25% de gastos y 20% de margen), esa fórmula por sí sola <strong>no</strong> te garantiza un loss ratio del
            55% — ese número es lo que la aritmética de la fórmula asume, no lo que el riesgo real produce. Esta metodología (comparar tu propia
            prima pura contra tu prima cobrada) solo es tan buena como tu propio modelo de frecuencia × severidad: si ese modelo subestima el
            riesgo real de tus pólizas, tu Loss Ratio Esperado hereda ese sesgo, y tu costo último estimado con él también.
          </p>
          <p>
            Como referencia para contrastar: el loss ratio real de <strong>todo el mercado</strong> — siniestros reales sobre la prima comercial
            que resultaría de tarificar con la fórmula de referencia — es de aproximadamente <strong>63%</strong>, moderadamente más alto que el
            55% que esa misma fórmula asume en teoría (la diferencia es por los siniestros catastróficos ocasionales que hacen la severidad más
            asimétrica de lo que un promedio simple sugiere). Si tu propio Loss Ratio Esperado queda muy por debajo de ese ~63% (por ejemplo,
            pegado al 55% &ldquo;de libro&rdquo; sin ajustar), es una señal de que tu modelo de frecuencia/severidad podría estar subestimando el
            riesgo real de tu cartera — vale la pena revisarlo antes de reservar con ese número. Un benchmark público del sector (loss ratios
            típicos de auto en Colombia) es una tercera referencia útil, aunque no reemplaza tu propio cálculo.
          </p>
          <p className="text-[13px] italic text-[var(--color-brand-text-secondary)]">
            Lo que <strong>no</strong> deberías hacer es tomar directamente la siniestralidad avisada hasta ahora como si fuera el costo total — eso
            subestima sistemáticamente el verdadero costo último, exactamente el error que el método ELR está diseñado para evitar.
          </p>
        </SubSection>

        <SubSection title="P&G de una aseguradora" accent="fin">
          <p>
            El estado de resultados de una aseguradora se parece al de cualquier empresa, pero con ajustes que reflejan cómo funciona el negocio de
            seguros: la prima no se &ldquo;gana&rdquo; toda de inmediato (una póliza a 12 meses todavía debe cubrir riesgo en los meses que faltan del
            año, así que una parte se aparta como Reserva de Prima No Devengada — un pasivo, no un ingreso todavía), y el resultado se separa en capas:
            Resultado Técnico (la rentabilidad pura de suscribir riesgo: prima devengada menos siniestros y gastos de adquisición/comercialización),
            Resultado Industrial (Resultado Técnico menos gastos administrativos) y, sumando el Resultado de Inversiones, la Utilidad Neta. Esa
            separación por capas no es cosmética: permite diagnosticar si un mal resultado viene de suscribir mal el riesgo, de gastos administrativos
            altos, o de un mal año de inversiones — tres causas con remedios distintos.
          </p>
        </SubSection>

        <SubSection title="Gestión ALM: calce de activos y pasivos" accent="fin">
          <p>
            Una aseguradora recibe efectivo por adelantado (la prima) y paga obligaciones inciertas en el tiempo (los siniestros) — el rol de la gestión
            ALM (Asset-Liability Management) es invertir ese efectivo de forma que esté disponible cuando esas obligaciones vencen, sin sacrificar más
            rendimiento del necesario por mantenerlo todo líquido. La tensión central es de plazo: los instrumentos de mayor plazo suelen rendir más,
            pero inmovilizan el capital — si los siniestros llegan antes de que esa inversión venza, hay que vender antes de tiempo (con penalización) o,
            en el peor caso, recurrir a capital propio para cubrir el faltante. Un portafolio bien calzado no es el de mayor rendimiento nominal, sino el
            que balancea rendimiento con la certeza de tener caja disponible cuando se necesita.
          </p>
        </SubSection>
      </Section>

      <Section n="3" title="Qué se te va a calificar">
        <SubSection title="Estado de resultados 2027" accent="fin">
          <p>
            Reporta cada línea del P&G del 2027 — no solo el resultado final. El motor ya conoce tu prima real (lo que efectivamente cobraste en el
            mercado, después del racionamiento por capital/solvencia si aplicó). Tu costo de siniestros, en cambio, ya no es un hecho que puedas leer
            directamente: solo ves los siniestros del 2027 ya avisados (la misma opacidad de IBNR de Día 1) — tu Costo de Siniestros A1 es tu propia
            estimación del costo <strong>último</strong>, vía el método Expected Loss Ratio (sección 2), no una suma de lo avisado. Los gastos de
            adquisición y comisión son los mismos porcentajes fijos sobre la prima <strong>emitida</strong> que ya usaste para calcular tu prima
            comercial en Día 1; el administrativo también, pero ya no resta dentro del Resultado Técnico — tiene su propia línea (Resultado
            Industrial, ver sección 5.1). Tu prima emitida no es lo mismo que tu prima devengada: reservas un 20% como Reserva de Prima No
            Devengada (RPND), la parte que todavía no has &ldquo;ganado&rdquo; — solo el 80% restante entra al Resultado Técnico como ingreso. El
            Resultado de inversiones es el ingreso real que tu árbol de portafolio (abajo) devengó durante los 12 meses del 2027 — no una fórmula, el
            resultado de la simulación mes a mes.
          </p>
          <p>
            No todas las líneas se califican igual. Las que son puramente una fórmula de otras líneas que ya reportaste (RPND constituida, prima
            devengada, gastos, Resultado Técnico, Resultado Industrial, utilidad antes de impuestos, impuesto, utilidad neta) se califican contra lo que
            <strong> tú mismo</strong> reportaste en esas otras líneas, no contra la cifra real del motor — un solo error (por ejemplo, en tu costo de
            siniestros) no te va a costar puntos varias veces en cada línea que depende de él, siempre que hayas aplicado la fórmula correctamente sobre
            tu propio número. Prima emitida, costo de siniestros y resultado de inversiones sí se califican contra la cifra real del motor — pero con
            una banda de tolerancia sobre el error relativo, no exigiendo un acierto exacto: tu costo de siniestros en particular es una estimación
            genuina (ver sección 2), y si quedó lejos del valor real todavía tienes una segunda oportunidad de corregirlo en Día 3
            (&ldquo;Ajuste de siniestralidad&rdquo;).
          </p>
        </SubSection>
        <SubSection title="Árbol de portafolio real (ALM)" accent="fin">
          <p>
            Construyes un árbol de decisiones de inversión: repartes tu presupuesto entre los instrumentos disponibles (tabla en la sección 5) y, para cada
            uno, decides qué pasa cuando venza — dejarlo en caja, repetirlo indefinidamente, o reasignarlo entre nuevos instrumentos (que a su vez tienen
            su propia decisión). El sistema simula, mes a mes durante 60 meses, cómo tu árbol enfrenta el flujo de caja real: primas que entran, siniestros
            y gastos que salen, vencimientos que regresan como caja, y lo que queda se reinvierte según tu árbol.
          </p>
          <p>
            Este es tu único árbol para toda la simulación: el mismo que sometes hoy es el que sigue invirtiendo la prima real del 2028 más adelante — no
            vas a tener una segunda oportunidad de someter uno distinto. Piensa tu árbol pensando en ambos años, no solo en el 2027.
          </p>
          <p>Tu nota (&ldquo;Calce ALM del portafolio&rdquo;) tiene 4 componentes, con estos pesos:</p>
          <ul className="list-disc pl-5">
            <li>
              <strong>Cumplimiento de Caja Mínima (35%)</strong> — qué tan poco tuviste que comprometer tu Capital Social para cubrir una caja
              insuficiente.
            </li>
            <li>
              <strong>Rendimiento ajustado por riesgo (35%)</strong> — tu rendimiento real simulado, descontado por la volatilidad de lo que mantuviste
              invertido y por qué tan concentrado quedó tu portafolio en un solo instrumento (ver sección 4).
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
            La sección 5 te da la plantilla exacta y las fórmulas de cada componente, para que puedas anticipar tu nota antes de enviar tu árbol, no solo
            leerla después.
          </p>
        </SubSection>
      </Section>

      <Section n="4" title="Conceptos que debes aplicar">
        <p className="text-[13px] italic text-[var(--color-brand-text-secondary)]">
          Esto es una guía de razonamiento, no una receta — la asignación óptima del portafolio es parte de lo que se evalúa que tu equipo descubra.
        </p>

        <SubSection title="Para estimar el costo de siniestros (ELR)" accent="act">
          <ul className="list-disc pl-5">
            <li>
              <strong>Tu siniestralidad avisada es un piso, no la respuesta.</strong> Es información real y útil (para contrastar tu ELR, no para
              reemplazarlo) — pero tomarla como el costo final ignora el IBNR que todavía no se avisa, y sistemáticamente subestima tu costo
              verdadero.
            </li>
            <li>
              <strong>Tu propio modelo de Día 1 ya trae un Loss Ratio Esperado implícito — no lo inventes desde cero.</strong> Compara la prima
              pura que tú mismo estimaste para las pólizas que ganaste contra lo que realmente cobraste por ellas; esa razón es tu ELR propio.
            </li>
            <li>
              <strong>No es el mismo número para todo el cohorte, y no es necesariamente el 55% de la fórmula de referencia.</strong> Ese 55% es
              lo que la fórmula asume en teoría, no lo que el riesgo real produce — el loss ratio real de todo el mercado ronda el 63% (sección 2).
              Si tu propio ELR queda muy por debajo de eso, sospecha primero de tu propio modelo de frecuencia/severidad antes de reservar con ese
              número.
            </li>
            <li>
              <strong>Prima Devengada, no Prima Emitida.</strong> El costo último se relaciona con la prima que efectivamente cubrió riesgo durante
              el año, no con toda la prima facturada (parte de la cual todavía no se ha &ldquo;ganado&rdquo; — ver RPND en la sección 3).
            </li>
          </ul>
        </SubSection>

        <SubSection title="Para el portafolio" accent="fin">
          <p>
            El menú de instrumentos (sección 5.2) tiene un trade-off real entre rendimiento y volatilidad — no asumas que el instrumento con el
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
              este descuento (no es una apuesta concentrada, es tu colchón de liquidez). Este mismo criterio de concentración vuelve a ser relevante
              más adelante en el ejercicio — entender por qué tu nota de hoy bajó te va a servir después.
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

        <PreguntasAbiertas>
          <li>¿Qué otras variables (más allá del historial de siniestros) usarías para diferenciar la retarifación de 2028 de la de 2027?</li>
          <li>¿Cómo cambiaría tu árbol de portafolio si tu horizonte no fuera de 2 años sino de 10?</li>
          <li>¿Qué le pasaría a tu Resultado de Inversiones si una recesión bajara el rendimiento de los instrumentos más riesgosos del menú?</li>
        </PreguntasAbiertas>
      </Section>

      <Section n="5" title="Plantillas — cómo se construyen y cómo alimentan el resultado">
        <p>
          Esta sección te muestra la <strong>estructura</strong> exacta que va a evaluar el motor, vacía, para que puedas planear tu estado de resultados
          y tu árbol en papel antes de construirlos en los formularios. Las fórmulas de calificación que aparecen aquí son las mismas que vas a ver, ya
          resueltas con tus números, en los resultados objetivos después de guardar cada entregable.
        </p>

        <FlowStep n="1" title="5.1 · Estado de resultados — 2027">
          <StatementTemplate
            rowLabels={PYG_ROWS}
            emphasizedLabels={["Resultado Técnico", "Resultado Industrial", "Utilidad antes de impuestos", "Utilidad neta"]}
            formulaNotes={[
              "RPND constituida = 20% × Prima emitida.",
              "Prima devengada = Prima emitida − RPND constituida (80% exacto en 2027, porque no hay un año anterior del que liberar nada — esto cambia a partir del 2028).",
              "Gastos de adquisición / Comisiones / administrativos = los mismos porcentajes de la prima emitida que usaste para tu prima comercial en Día 1.",
              "Resultado Técnico = Prima devengada − Costo − Gadq − Gcom (sin el gasto administrativo).",
              "Resultado Industrial = Resultado Técnico − Gasto administrativo.",
              "Utilidad antes de impuestos = Resultado Industrial + Resultado de inversiones.",
              "Impuesto = 30% × máx(0, Utilidad antes de impuestos) — nunca negativo.",
              "Resultado de inversiones sale de tu árbol de portafolio (secciones 5.2-5.6), no de una fórmula aparte.",
            ]}
          />
        </FlowStep>

        <FlowStep n="2" title="5.2 · Instrumentos disponibles">
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
        </FlowStep>

        <FlowStep n="3" title="5.3 · Tu árbol de decisión — plantilla en blanco">
          <BlankTable
            headers={["Instrumento (del menú de 5.2)", "% asignado", "Vencimiento personalizado (solo LIQ/ACC)", "Al vencer, ¿qué haces?"]}
            rows={5}
            note='Si en "Al vencer, ¿qué haces?" elegiste reasignar, repite esta misma tabla para esa porción — el vencimiento de la nueva línea se cuenta desde el mes en que venció la anterior, no desde el mes 0. Los instrumentos con plazo propio (CDT90/TES1/TES3/TESUVR8) siempre vencen en su propio plazo; el vencimiento personalizado solo aplica a LIQ y ACC.'
          />
        </FlowStep>

        <FlowStep n="4" title="5.4 · Cómo se traduce tu árbol en caja, mes a mes — plantilla del estado de caja">
          <BlankTable
            headers={["Mes", "Caja Inicial", "Prima Cobrada", "Pago Siniestros", "Gastos", "Vencimientos en caja", "Inversión Neta", "Caja Final"]}
            rows={4}
            note="Caja Final = Caja Inicial + Prima Cobrada − Pago Siniestros − Gastos + Vencimientos en caja − Inversión Neta. El motor repite esta cuenta 60 veces (60 meses) aplicando tu árbol de la sección 5.3."
          />
          <p className="mt-2 rounded border border-[var(--color-brand-cyan-light)] bg-[var(--color-brand-cyan-light)] px-3 py-2 text-xs text-[var(--color-brand-text-secondary)]">
            <span className="font-semibold text-[var(--color-brand-blue-accent)]">Cómo se determina cuánto se invierte cada mes — </span>
            primero se calcula la Caja Disponible = Caja Inicial + Prima Cobrada − Pago Siniestros − Gastos + Vencimientos en caja. Esa Caja Disponible se
            compara contra la Caja Mínima obligatoria de ese mes (15% × [Prima Cobrada + Pago Siniestros]): si la excede, <strong>todo el excedente</strong>{" "}
            (Caja Disponible − Caja Mínima) es la Inversión Neta de ese mes, aplicada según tu árbol de la sección 5.3 — nunca es la Prima Cobrada cruda.
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
        </FlowStep>

        <FlowStep n="5" title="5.5 · Las 4 notas — plantilla de calificación">
          <div className="flex flex-col gap-3 rounded border border-[var(--color-brand-blue-accent)] bg-[var(--color-brand-blue-light)] p-4">
            <p className="text-xs uppercase text-[var(--color-brand-text-secondary)]">Nota final del ALM</p>
            <p className="flex h-10 w-32 items-center justify-center rounded border border-dashed border-[var(--color-brand-blue-accent)] font-[family-name:var(--font-condensed)] text-lg font-bold text-[var(--color-brand-text-secondary)]">
              &nbsp;
            </p>
            <p className="text-sm leading-relaxed text-[var(--color-brand-text-secondary)]">
              = 35% × Cumplimiento de Caja + 35% × Rendimiento ajustado + 20% × Venta forzada + 10% × Liquidez
            </p>
          </div>
          <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
            <ScoreCard label="Cumplimiento de Caja Mínima" weight="35%" formula="100 × (1 − 0.5×[peor mes de capital comprometido ÷ Capital Social] − 0.5×[acumulado ÷ Capital Social])" />
            <ScoreCard
              label="Rendimiento ajustado por riesgo"
              weight="35%"
              formula="normalizado de (rendimiento efectivo simulado − 0.35 × volatilidad promedio realizada − 0.03 × concentración del portafolio [0 a 1, excluye LIQ])"
            />
            <ScoreCard label="Venta forzada de portafolio" weight="20%" formula="100 × (1 − severidad de lo vendido bajo presión, ponderada por volatilidad)" />
            <ScoreCard label="Liquidez" weight="10%" formula="100 × min(1, líquido disponible ÷ pagos esperados en los próximos 6 meses)" />
          </div>
        </FlowStep>

        <FlowStep n="6" title="5.6 · El camino completo, de tu decisión a tu nota" last>
          <div className="rounded border border-[var(--color-brand-gray-light)] p-3">
            <p className="text-sm">
              Tu árbol (5.3) → se simula mes a mes contra la caja real (5.4) → sus resultados (capital comprometido, rendimiento, ventas forzadas, liquidez)
              alimentan las 4 notas (5.5) → esas 4 notas, ponderadas, son tu nota final de ALM de hoy.
            </p>
            <p className="mt-2 text-sm">
              Esa misma nota final NO es directamente lo que vas a reportar como Resultado de Inversiones en tu P&G — para ese entregable necesitas volver a
              razonar tu árbol, esta vez con tu prima real (la que ya conoces) en vez del supuesto de fondeo perfecto de esta plantilla. El objetivo de esta
              guía es que entiendas la mecánica completa desde ahora, para que ese siguiente paso sea un ajuste sobre algo que ya entiendes, no un ejercicio
              desde cero.
            </p>
          </div>
        </FlowStep>
      </Section>
    </div>
  );
}
