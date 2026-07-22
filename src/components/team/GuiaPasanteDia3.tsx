import { InsumosEntregables, PreguntasAbiertas, FlowStep } from "./GuiaShared";
import { CHAIN_LADDER_TAIL_FACTOR } from "@/domain/reserving/constants";

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
function StatementTemplate({ rowLabels, columns, emphasizedLabels, formulaNotes }: { rowLabels: string[]; columns: string[]; emphasizedLabels?: string[]; formulaNotes?: string[] }) {
  return (
    <div className="flex flex-col gap-3">
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
          Día 3 — Estado de resultados 2028/2029 (proy.) y Balance
        </p>
        <p className="mt-4 text-sm text-[var(--color-brand-text-secondary)]">
          Esta es tu herramienta principal para abordar el reto de hoy. Léela antes de construir tus estados financieros: te explica exactamente qué se
          va a calificar, con qué criterios, y qué conceptos debes tener en cuenta — sin resolverte el ejercicio.
        </p>
      </header>

      <InsumosEntregables
        insumos={[
          "Siniestros propios del 2027 avisados en 2027 y en 2028, más siniestros propios del 2028 avisados en 2028 — con fecha exacta de siniestro y de aviso, para armar tu propio triángulo de desarrollo mensual (Chain Ladder, sección 2).",
          "Pagos reales del 2028 sobre los siniestros del 2027 (desarrollo) y los siniestros propios del 2028.",
          "Capital comprometido acumulado y rendimiento real devengado por tu ALM real de 2027/2028.",
          "Retención real de pólizas de 2027 a 2028, para proyectar el 2029.",
        ]}
        entregables={[
          "Estado de resultados completo del 2028 (15 líneas) y proyección del 2029 (14 líneas).",
          "Balance de 2027, 2028 y 2029 (10 líneas cada uno).",
          "Siniestros pagados en 2028 (desglose de caja, no una línea del P&G).",
        ]}
      />

      <Section n="1" title="Contexto del día">
        <p>
          Ya conoces cuánto pagaste durante el 2028 de los siniestros del 2027 y cuánto sigue pendiente. Con eso, cierras el ciclo financiero completo
          de los dos años simulados y proyectas un tercero.
        </p>
        <ul className="list-disc pl-5">
          <li>
            <strong>Actuarial — reservas técnicas de 2027 y 2028.</strong> Las calculas y las entregas como la línea &ldquo;Reservas técnicas&rdquo;
            del Balance de cada año — siempre el saldo real de siniestralidad menos lo pagado hasta ese punto, nunca una estimación de mercado.
          </li>
          <li>
            <strong>Financiero — estados de resultados completos de 2028 (15 líneas) y 2029 proyectado (14 líneas).</strong> La misma estructura que
            reportaste para el 2027 en Día 2, con dos diferencias: cada año libera la Reserva de Prima No Devengada que el año anterior constituyó
            (además de constituir la propia), y 2028 además carga &ldquo;Ajuste de siniestralidad&rdquo; — la corrección de tu propio Costo de
            Siniestros A1 de Día 2 contra el costo real del 2027 — como su propia línea; 2029 no tiene esa última.
          </li>
          <li>
            <strong>Financiero — Balance de 2027, 2028 y 2029.</strong> El mismo balance simplificado (caja, inversiones, cuentas por cobrar/pagar,
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
            La familia de métodos más usada — Chain Ladder — organiza los siniestros en un triángulo de desarrollo: filas por periodo de
            ocurrencia (puede ser año, trimestre o mes — cuanto más fino el periodo, más filas y más factores para encadenar), columnas por
            periodo de desarrollo (cuántos periodos han pasado desde que ocurrió) y cada celda es el monto acumulado — avisado o pagado, según qué
            dato se tenga — de ese periodo de ocurrencia hasta ese punto de desarrollo. Con periodos de ocurrencia ya completamente desarrollados se
            calculan factores de desarrollo (&ldquo;edad a edad&rdquo;) — cuánto crece típicamente el monto acumulado de un periodo de desarrollo al
            siguiente — y esos factores se encadenan y se aplican a los periodos todavía incompletos para proyectar cuánto falta por reconocer (de
            ahí el nombre: cada edad se apalanca en la anterior, como los peldaños de una escalera). Lo que falta de siniestros que ya ocurrieron
            pero que la aseguradora todavía no conoce en detalle (o ni siquiera sabe que existen) se llama IBNR (<em>Incurred But Not Reported</em>)
            — el costo <strong>último</strong> es la suma de lo ya avisado más ese IBNR. Este ejercicio usa un triángulo de <strong>avisados</strong>,
            no de pagos: la severidad de un siniestro queda fija desde el momento en que se avisa, así que el monto avisado acumulado ya es una
            base de desarrollo directa.
          </p>
        </SubSection>

        <SubSection title="Construye tu propio triángulo de desarrollo" accent="act">
          <p>
            Tu reporte de hoy trae la fecha exacta de siniestro y de aviso de cada uno de tus siniestros propios del 2027 (ahora visibles los 12
            meses del año, gracias a la ventana ampliada) y del 2028. Eso alcanza para algo más fino que dos puntos anuales: un triángulo{" "}
            <strong>mensual</strong> — filas por mes de ocurrencia (enero 2027 a diciembre 2028, 24 meses posibles) y columnas por mes de desarrollo
            transcurrido hasta el aviso (columna 0 = avisado el mismo mes del siniestro, columna 1 = un mes después, y así sucesivamente).
          </p>
          <p>
            Tu reporte refleja un único momento en el tiempo (fin de 2028), así que cada mes de ocurrencia ha tenido un tiempo distinto para
            desarrollarse: enero 2027 lleva ya cerca de 24 meses madurando, mientras que diciembre 2028 apenas lleva 0-1 mes. Eso arma la forma de
            escalera típica de un triángulo — los meses de ocurrencia más antiguos tienen muchas columnas conocidas, los más recientes casi
            ninguna. Un fragmento ilustrativo de 4 de tus 24 filas posibles (números inventados, no los tuyos):
          </p>
          <div className="overflow-x-auto">
            <table className="w-full border-collapse border border-[var(--color-brand-gray-light)] text-xs">
              <thead>
                <tr>
                  <th className="border border-[var(--color-brand-gray-light)] bg-[var(--color-brand-blue-light)] px-2 py-1.5 text-left font-semibold text-[var(--color-brand-blue-accent)]">
                    Mes de ocurrencia
                  </th>
                  <th className="border border-[var(--color-brand-gray-light)] bg-[var(--color-brand-blue-light)] px-2 py-1.5 text-left font-semibold text-[var(--color-brand-blue-accent)]">
                    Desarrollo 0
                  </th>
                  <th className="border border-[var(--color-brand-gray-light)] bg-[var(--color-brand-blue-light)] px-2 py-1.5 text-left font-semibold text-[var(--color-brand-blue-accent)]">
                    Desarrollo 1
                  </th>
                  <th className="border border-[var(--color-brand-gray-light)] bg-[var(--color-brand-blue-light)] px-2 py-1.5 text-left font-semibold text-[var(--color-brand-blue-accent)]">
                    Desarrollo 2
                  </th>
                  <th className="border border-[var(--color-brand-gray-light)] bg-[var(--color-brand-blue-light)] px-2 py-1.5 text-left font-semibold text-[var(--color-brand-blue-accent)]">
                    Desarrollo 3
                  </th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td className="border border-[var(--color-brand-gray-light)] px-2 py-1.5 font-semibold">Oct 2027</td>
                  <td className="border border-[var(--color-brand-gray-light)] px-2 py-1.5">$40</td>
                  <td className="border border-[var(--color-brand-gray-light)] px-2 py-1.5">$55</td>
                  <td className="border border-[var(--color-brand-gray-light)] px-2 py-1.5">$62</td>
                  <td className="border border-[var(--color-brand-gray-light)] px-2 py-1.5">$65</td>
                </tr>
                <tr>
                  <td className="border border-[var(--color-brand-gray-light)] px-2 py-1.5 font-semibold">Nov 2027</td>
                  <td className="border border-[var(--color-brand-gray-light)] px-2 py-1.5">$38</td>
                  <td className="border border-[var(--color-brand-gray-light)] px-2 py-1.5">$52</td>
                  <td className="border border-[var(--color-brand-gray-light)] px-2 py-1.5">$59</td>
                  <td className="border border-[var(--color-brand-gray-light)] px-2 py-1.5 italic text-[var(--color-brand-text-secondary)]">
                    ?
                  </td>
                </tr>
                <tr>
                  <td className="border border-[var(--color-brand-gray-light)] px-2 py-1.5 font-semibold">Dic 2027</td>
                  <td className="border border-[var(--color-brand-gray-light)] px-2 py-1.5">$42</td>
                  <td className="border border-[var(--color-brand-gray-light)] px-2 py-1.5">$57</td>
                  <td className="border border-[var(--color-brand-gray-light)] px-2 py-1.5 italic text-[var(--color-brand-text-secondary)]">
                    ?
                  </td>
                  <td className="border border-[var(--color-brand-gray-light)] px-2 py-1.5 italic text-[var(--color-brand-text-secondary)]">
                    ?
                  </td>
                </tr>
                <tr>
                  <td className="border border-[var(--color-brand-gray-light)] px-2 py-1.5 font-semibold">Ene 2028</td>
                  <td className="border border-[var(--color-brand-gray-light)] px-2 py-1.5">$45</td>
                  <td className="border border-[var(--color-brand-gray-light)] px-2 py-1.5 italic text-[var(--color-brand-text-secondary)]">
                    ?
                  </td>
                  <td className="border border-[var(--color-brand-gray-light)] px-2 py-1.5 italic text-[var(--color-brand-text-secondary)]">
                    ?
                  </td>
                  <td className="border border-[var(--color-brand-gray-light)] px-2 py-1.5 italic text-[var(--color-brand-text-secondary)]">
                    ?
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
          <p>
            Con más de dos columnas hay más de un factor edad a edad: 0→1 (promediando las filas que ya tienen ambas edades: Oct, Nov y Dic ≈ 1.37),
            1→2 (Oct y Nov ≈ 1.13) y 2→3 (solo Oct ≈ 1.05). Para proyectar una fila incompleta se <strong>encadenan</strong> tantos factores como
            haga falta — Nov solo necesita el último (59 × 1.05 ≈ 62), pero Ene 2028 necesita los tres seguidos (45 × 1.37 × 1.13 × 1.05 ≈ 73). Esa
            cadena de factores sucesivos es justo lo que le da su nombre al método — con solo dos columnas (como en un triángulo anual) nunca se ve
            más que un único eslabón.
          </p>
          <p>
            Ese factor edad a edad lo calculas tú, con tus propios datos — no hay un número de referencia para eso, es justamente lo que Chain
            Ladder te pide estimar. Encadenándolos puedes llevar cualquiera de tus filas hasta la edad más madura que alcances con tu propia
            información: cerca de 24 meses para tus meses de ocurrencia de comienzos del 2027.
          </p>
          <p>
            Ni esa edad más madura es &ldquo;lo último&rdquo; todavía: con un rezago de aviso que puede llegar hasta 730 días (~2 años) desde la
            ocurrencia, sigue quedando un remanente muy pequeño de siniestros del 2027 sin avisar incluso a estas alturas. Ese remanente se cubre
            con un factor de cola — este, a diferencia de los edad a edad, sí te lo damos, porque no hay forma de estimarlo solo con tus propios
            datos (no tienes visibilidad de lo que pasa después del corte de tu reporte):
          </p>
          <div className="rounded border border-[var(--color-brand-blue-accent)] bg-[var(--color-brand-blue-light)] p-4 text-center">
            <p className="font-[family-name:var(--font-condensed)] text-base font-bold text-[var(--color-brand-blue-accent)] sm:text-lg">
              Costo Último = Monto desarrollado a tu edad más madura observable (~24 meses) × {CHAIN_LADDER_TAIL_FACTOR}
            </p>
          </div>
          <p className="text-[13px] italic text-[var(--color-brand-text-secondary)]">
            Un factor pequeño (~0.3%) a propósito: con esta distribución de rezago de aviso, la enorme mayoría de los siniestros ya se conoce a los
            24 meses. No es cero — por eso Chain Ladder real siempre incluye un factor de cola, aunque sea modesto — pero tampoco es el ajuste
            dominante de tu estimación; los factores edad a edad que calculas tú mismo, encadenados, pesan mucho más.
          </p>
          <p>
            <strong>Esta es una forma de estimar distinta a la que usaste en Día 2.</strong> El método Expected Loss Ratio parte de un supuesto
            externo (tu propio loss ratio esperado, anclado en tu tarifa) multiplicado por la prima — no usa ningún dato de desarrollo propio,
            porque en Día 2 no existía ninguno. Chain Ladder, en cambio, no necesita ni prima ni ningún supuesto de loss ratio: proyecta el costo
            último completamente a partir de cómo se desarrolló tu propia experiencia real. Son dos filosofías distintas — una asume un resultado
            externo cuando no hay suficiente experiencia propia; la otra confía por completo en la experiencia propia una vez esta ya tiene forma de
            desarrollarse. Lo que cambió no es el año en sí, sino cuántas columnas de tu triángulo existen: en Día 2 tu reporte solo daba una
            columna (12 meses) para el 2027 completo, sin ninguna otra edad con la que calcular un factor — ahí sí hacía falta ELR. Hoy tu triángulo
            mensual cubre 2027 y 2028 a la vez, evaluados en el mismo corte (fin de 2028): tus meses de 2027 más maduros te dan los factores edad a
            edad, y esos mismos factores encadenados también proyectan tus meses de 2028 más recientes — no necesitas ELR para ninguno de los dos.
          </p>
        </SubSection>

        <SubSection title="El Balance: qué es y cómo se arma" accent="fin">
          <p>
            El estado de resultados mide un <strong>flujo</strong>: todo lo que entró y salió durante un periodo (el 2028, por ejemplo). El Balance
            mide algo distinto — una <strong>foto fija</strong> de lo que la aseguradora tiene y debe en un instante preciso, al cierre de cada año
            (2027, 2028 y 2029). No se suma periodo a periodo como una línea del P&G: cada año tiene su propio Balance, aunque el patrimonio de un
            año arrastra el del anterior más lo que ese año generó.
          </p>
          <p>
            Toda esa foto se organiza alrededor de una identidad que siempre debe cumplirse exactamente: <strong>Activos = Pasivo + Patrimonio</strong>.
            Activos es todo lo que la aseguradora posee o tiene derecho a cobrar; Pasivo es todo lo que le debe a terceros (asegurados incluidos);
            Patrimonio es lo que le queda al dueño del negocio una vez se descuentan esas obligaciones — por construcción, nunca es un número libre,
            sino lo que cierra la ecuación.
          </p>
          <p>
            <strong>Activos:</strong> Caja (efectivo disponible de inmediato), Inversiones (el valor de mercado hoy de tu árbol de portafolio — no
            lo que costó comprarlo) y Cuentas por cobrar (prima ya emitida que todavía no se ha recibido en efectivo). Activos totales es la suma de
            esas tres.
          </p>
          <p>
            <strong>Pasivo:</strong> Reservas técnicas (lo que falta por pagar de siniestros ya incurridos — RSA + IBNR, siempre el saldo real
            pendiente, nunca una estimación de mercado), RPND (la parte de la prima ya cobrada que corresponde a cobertura de un periodo futuro
            todavía no transcurrido — es una obligación de seguir cubriendo el riesgo, no plata que ya se ganó) y Cuentas por pagar (otras
            obligaciones operativas pendientes). Pasivo total es la suma de esas tres.
          </p>
          <p>
            <strong>Patrimonio</strong> es lo que queda para el dueño del negocio: activos menos pasivo. No se calcula desde cero cada año — es el
            patrimonio del año anterior más la utilidad neta que ese año generó en el P&G (más cualquier otro movimiento patrimonial, si lo hubiera).
            Es el punto exacto donde el estado de resultados (un flujo) termina alimentando al Balance (una foto).
          </p>
          <p>
            La última línea, <strong>Pasivo + Patrimonio</strong>, no es una fila más — es la verificación de que toda la foto es consistente:
            debe coincidir exactamente con Activos totales. Si no cuadra, el error no está ahí, está en cómo se calculó alguna de las líneas
            anteriores.
          </p>
        </SubSection>
      </Section>

      <Section n="3" title="Qué se te va a calificar">
        <SubSection title="Estado de resultados 2028" accent="fin">
          <p>
            El costo de siniestros del 2028 es, en <strong>base fecha de accidente</strong>, únicamente lo ocurrido dentro del 2028 — nunca se mezcla
            con lo del 2027 (eso ya se reconoció como costo en el P&G del 2027 mismo, sin importar cuándo se avisara). Lo que sí es propio de este año
            es una línea aparte: <strong>Ajuste de siniestralidad (A1)</strong>, la diferencia entre el costo real del 2027 y lo que tú mismo reportaste
            como Costo de Siniestros A1 en Día 2 — puede ser positivo (subestimaste tu propia siniestralidad) o negativo (la sobreestimaste). Resta junto
            al costo antes de llegar al Resultado Técnico, pero es conceptualmente distinto: no es costo de siniestros de 2028, es la corrección de tu
            propia estimación de Día 2.
          </p>
          <p>
            Tu prima devengada del 2028 tampoco es un 80% plano de tu prima emitida de este año: liberas el 100% de la Reserva de Prima No Devengada que
            constituiste en 2027 y constituyes una nueva sobre tu prima emitida de 2028 — si tu prima creció o bajó de un año a otro, lo liberado y lo
            constituido no se cancelan exactamente.
          </p>
          <p>
            El Resultado de inversiones es, otra vez, el ingreso real que tu árbol de portafolio devengó durante los 12 meses del 2028 — esta corrida no
            empieza de cero, continúa exactamente donde terminó el 2027 real (mismas posiciones abiertas, mismo capital comprometido acumulado).
          </p>
        </SubSection>

        <SubSection title="Estado de resultados 2029 (proyectado)" accent="fin">
          <p>
            El 2029 <strong>no se simula</strong> — no hay un tercer mercado ni un ALM propio. Pero tampoco es una sola tasa de crecimiento aplicada a
            todo: cada línea se proyecta con la lógica que le corresponde, no todas igual.
          </p>
          <p>
            La prima depende de cuántas pólizas conservas (retención) y cuántas ganas de nuevo — no de crecer el peso total de la prima de 2028 por un
            porcentaje. El costo de siniestros de 2029, a diferencia del de 2028, es <strong>solo</strong> el siniestro propio de 2029 proyectado —
            sin ninguna línea de ajuste de siniestralidad: lo que sigue pagándose de siniestros de 2027/2028 ya se reconoció como costo en su propio año de
            accidente, así que no vuelve a aparecer aquí (sí sigue existiendo como saldo de reserva en el Balance, ver sección 5.3). Y el Resultado de
            inversiones ya no puede salir de una fórmula plana sobre la reserva: piensa en qué te dice tu propio ALM real de 2028 sobre lo que tu
            portafolio efectivamente rindió, más allá de lo que su rendimiento nominal prometía. Ver sección 4 para cómo razonar cada pieza.
          </p>
        </SubSection>

        <SubSection title="Balance — 2027, 2028 y 2029" accent="fin">
          <p>
            El mismo balance simplificado para los tres años, construido a partir del estado de resultados de cada uno: cuánta caja, cuentas por cobrar e
            inversiones tienes (activos), cuánto debes en reservas técnicas, Reserva de Prima No Devengada (RPND) y cuentas por pagar (pasivo), y qué te
            queda (patrimonio). La RPND es la misma cifra que ya calculaste en el estado de resultados de ese año (lo que constituiste sobre tu prima
            emitida) — aquí aparece como pasivo, junto a las reservas técnicas, no como un cargo del P&G. La última línea, Pasivo + Patrimonio, debe
            cuadrar exactamente con Activos totales — es la identidad contable básica, y una forma de verificar tu propio trabajo antes de enviarlo.
          </p>
          <p className="text-[13px] italic text-[var(--color-brand-text-secondary)]">
            Las reservas técnicas de cada año son siempre el saldo real por pagar (RSA + IBNR para el 2027; lo pendiente de ambos orígenes al cierre
            del 2028) — nunca una estimación de mercado, así que se reportan como una línea del Balance, no como un entregable aparte.
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
              2028 es únicamente lo ocurrido en el 2028; la corrección de tu propio Costo de Siniestros A1 de Día 2 es una línea aparte, Ajuste de
              siniestralidad, no un componente del costo de 2028. Son dos ideas distintas: cuánto costó lo que pasó este año, y qué tan buena fue tu
              propia estimación de siniestralidad del año anterior.
            </li>
          </ul>
        </SubSection>

        <SubSection title="Para la proyección del 2029" accent="fin">
          <p className="text-[13px] italic text-[var(--color-brand-text-secondary)]">
            Sin un mercado real que simular, cada línea necesita su propia regla explícita y consistente — no una intuición libre, y no la misma regla
            para todas.
          </p>
          <ul className="list-disc pl-5">
            <li>
              <strong>La prima no crece sola — depende de cuántas pólizas conservas.</strong> Piensa en tu 2029 como pólizas retenidas de 2028 (a la
              misma tasa de retención que ya observaste de 2027 a 2028) más pólizas nuevas — no como un porcentaje aplicado al total de prima de 2028.
            </li>
            <li>
              <strong>El costo de siniestros de 2029 es solo el siniestro propio de 2029 — sin ajuste de siniestralidad.</strong> A diferencia del
              2028, no hay una línea de Ajuste de siniestralidad aquí: no hay un día posterior a Día 3 donde corregir un eventual error de esta
              proyección. Y lo que sigue pagándose de siniestros de 2027 y 2028 (cada siniestro tiene 3 años de desarrollo, no 2 — repasa la sección 4
              de la guía de Día 2 si no la tienes fresca) ya se reconoció como costo en el P&G de su propio año de accidente, así que no se cuenta otra
              vez aquí — solo sigue existiendo como saldo de reserva en el Balance.
            </li>
            <li>
              <strong>Para proyectar el siniestro propio de 2029, separa frecuencia de severidad.</strong> La frecuencia (cuántas pólizas de tu libro
              tienen siniestro) no tiene por qué cambiar de un año a otro sin razón — la severidad (cuánto cuesta cada siniestro) sí, por inflación. No
              las mezcles en una sola tasa de crecimiento.
            </li>
            <li>
              <strong>¿Qué tasa de inflación de siniestros usar?</strong> La misma que ya estimaste y aplicaste para tarificar el 2028 (recuerda:
              mayor a la inflación general de referencia del 6%, ver la guía de Día 2) aplica otra vez para proyectar 2029. Puedes verificar qué tan
              bien le atinaste comparando la severidad promedio de tus propios siniestros reales entre 2027 y 2028.
            </li>
            <li>
              <strong>El Resultado de inversiones ya no puede salir de una fórmula plana sobre la reserva.</strong> Piensa en lo que tu ALM real de 2028
              efectivamente rindió (no lo que su árbol prometía rendir en teoría) — si tuviste que vender algo bajo presión o comprometer capital en
              2028, eso también debería pesar en tu proyección de 2029, no desaparecer.
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
          <li>
            ¿Por qué Chain Ladder no era una opción en Día 2 para reservar los siniestros del 2027, y sí lo es hoy? ¿Qué cambió exactamente entre
            esos dos momentos?
          </li>
          <li>¿Qué pasaría con tu Balance si el desarrollo real de los siniestros del 2027 hubiera sido más lento de lo esperado?</li>
          <li>¿Qué factores además de la retención de pólizas podrían justificar una proyección de 2029 distinta a la que hiciste?</li>
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

        <FlowStep n="1" title="5.1 · Estado de resultados — 2028">
          <StatementTemplate
            rowLabels={PYG_A2_ROWS}
            columns={["2028"]}
            emphasizedLabels={["Resultado Técnico", "Resultado Industrial", "Utilidad antes de impuestos", "Utilidad neta"]}
            formulaNotes={[
              "RPND liberada (A1) = 20% × tu Prima emitida A1 (Día 2).",
              "RPND constituida = 20% × Prima emitida A2.",
              "Prima devengada = Prima emitida − RPND constituida + RPND liberada — un roll-forward genuino, no un 80% plano de la prima de este año.",
              "Gastos de adquisición / Comisiones / administrativos = 4% / 15% / 6% de la Prima emitida A2.",
              "Resultado Técnico = Prima devengada − Costo − Ajuste de siniestralidad − Gadq − Gcom.",
              "Resultado Industrial = Resultado Técnico − Gasto administrativo.",
              "Impuesto = 30% × max(0, Utilidad antes de impuestos) — nunca negativo.",
            ]}
          />
        </FlowStep>

        <FlowStep n="2" title="5.1b · Estado de resultados — 2029 (proyectado)">
          <StatementTemplate
            rowLabels={PYG_A3_ROWS}
            columns={["2029 (proy.)"]}
            emphasizedLabels={["Resultado Técnico", "Resultado Industrial", "Utilidad antes de impuestos", "Utilidad neta"]}
            formulaNotes={[
              "Misma estructura que 2028, pero sin línea de Ajuste de siniestralidad (ver sección 4 para por qué).",
              "RPND liberada aquí usa tu Prima emitida A2 de la tabla de arriba, no la de Día 2.",
            ]}
          />
        </FlowStep>

        <FlowStep n="3" title="5.2 · Nota — siniestros pagados (no es una línea del P&G)">
          <div className="rounded border border-[var(--color-brand-cyan-light)] bg-[var(--color-brand-cyan-light)] px-3 py-2">
            <p className="text-xs text-[var(--color-brand-text-secondary)]">
              Además del estado de resultados, reportas una cifra más para el 2028: <strong>Siniestros pagados en A2</strong> (la caja efectivamente
              pagada durante el año, de ambos orígenes). No se suma ni se resta en el estado de resultados — es un desglose/auditoría de flujo de caja,
              distinto del costo incurrido (base contable) que ya reportaste en la sección 5.1.
            </p>
          </div>
        </FlowStep>

        <FlowStep n="4" title="5.3 · Balance — 2027, 2028 y 2029 (proy.)">
          <StatementTemplate
            rowLabels={BALANCE_ROWS}
            columns={["2027", "2028", "2029 (proy.)"]}
            emphasizedLabels={["Activos totales", "Pasivo + Patrimonio"]}
            formulaNotes={[
              "Caja / Cuentas por cobrar / Cuentas por pagar / RPND = 15% / 7% / 10% / 20% de la Prima emitida de ese año (la de 2027 la reportaste en Día 2).",
              "Pasivo total = Reservas técnicas + RPND + Cuentas por pagar.",
              "Pasivo + Patrimonio debe ser exactamente igual a Activos totales.",
            ]}
          />
        </FlowStep>

        <FlowStep n="5" title="5.4 · El camino completo, de tus decisiones a tu reporte" last>
          <div className="rounded border border-[var(--color-brand-gray-light)] p-3">
            <p className="text-sm">
              El costo real de siniestros del 2027 (4) + tu árbol de portafolio de Día 2 → alimentan el estado de resultados del 2028 (5.1) → que junto
              con la retención real de 2028 y el rendimiento realmente devengado por tu ALM real, te da la proyección del 2029 (5.1b, sin línea de Ajuste
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
