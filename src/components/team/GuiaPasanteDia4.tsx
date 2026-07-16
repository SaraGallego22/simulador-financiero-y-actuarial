import { SECTOR_DIMENSIONS } from "@/domain/grading/sectors";

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

function ScoreCard({ label, formula }: { label: string; formula: string }) {
  return (
    <div className="rounded border border-[var(--color-brand-gray-light)] p-2">
      <p className="text-xs text-[var(--color-brand-text-secondary)]">{label}</p>
      <p className="my-1 flex h-8 items-center rounded border border-dashed border-[var(--color-brand-gray-light)] px-2 font-[family-name:var(--font-condensed)] text-lg font-bold text-[var(--color-brand-text-secondary)]">
        &nbsp;
      </p>
      <p className="text-[10px] italic text-[var(--color-brand-text-secondary)]">{formula}</p>
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

export function GuiaPasanteDia4() {
  return (
    <div className="flex flex-col gap-5 text-[var(--color-foreground)]">
      <header className="rounded-lg border-t-8 border-t-[var(--color-brand-blue)] bg-[var(--color-brand-surface)] p-6">
        <p className="text-xs font-semibold uppercase tracking-wide text-[var(--color-brand-blue-accent)]">Pasantía Técnica · Seguros SURA</p>
        <h1 className="mt-1 font-[family-name:var(--font-condensed)] text-3xl font-bold text-[var(--color-brand-blue)]">Guía del pasante</h1>
        <p className="mt-1 font-[family-name:var(--font-condensed)] text-lg font-semibold text-[var(--color-brand-blue-accent)]">
          Día 4 — Solvencia, dividendos y analítica sectorial
        </p>
        <p className="mt-4 text-sm text-[var(--color-brand-text-secondary)]">
          Esta es tu herramienta principal para abordar el reto de hoy. Léela antes de reportar tu solvencia o enviar tu recomendación sectorial: te
          explica exactamente qué se va a calificar, con qué criterios, y qué conceptos debes tener en cuenta — sin resolverte el ejercicio.
        </p>
      </header>

      <Section n="1" title="Contexto del día">
        <p>
          Es el último día del ejercicio. Todo lo que reportaste en los días anteriores — tu Balance de cada año, la volatilidad de tu portafolio, tu
          conocimiento del mercado — converge en dos entregables finales, independientes entre sí.
        </p>
        <ul className="list-disc pl-5">
          <li>
            <strong>Financiero — solvencia y dividendos.</strong> Calculas cuánto capital de riesgo requiere tu operación (RK), lo comparas contra tus
            fondos propios (patrimonio), y de ahí sale tu margen de solvencia y el dividendo que tu equipo podría sugerir repartir.
          </li>
          <li>
            <strong>Actuarial — recomendación sectorial.</strong> Nombras hasta 3 sectores del mercado que priorizarías para crecer y hasta 3 para
            disminuir, en orden de prioridad — sin ver la respuesta correcta directamente, solo tu propia cartera (parcial) y el CSV público del universo.
          </li>
        </ul>
      </Section>

      <Section n="2" title="Qué se te va a calificar">
        <SubSection title="Solvencia y dividendos" accent="fin">
          <p>
            Reportas 4 líneas: el <strong>Requerimiento de Capital (RK)</strong>, tus <strong>Fondos propios</strong>, el{" "}
            <strong>Margen de solvencia</strong> (fondos propios ÷ RK) y el <strong>Dividendo posible</strong> — cada una calificada por separado con una
            banda de tolerancia sobre el error relativo, igual que el resto de tus entregables numéricos.
          </p>
          <p>
            El RK combina tres riesgos (suscripción, financiero y operacional) — el riesgo financiero es el que conecta directamente con tus decisiones
            de portafolio de los días anteriores: no es un porcentaje plano sobre tus inversiones, se escala por qué tan volátil resultó realmente tu
            portafolio frente al promedio del menú de instrumentos. Un equipo que concentró su árbol en el instrumento más volátil paga un capital de
            riesgo mayor que uno con el mismo monto invertido de forma más conservadora — sin importar el rendimiento nominal que haya obtenido. Ver
            sección 4 para las fórmulas completas.
          </p>
        </SubSection>

        <SubSection title="Recomendación sectorial" accent="act">
          <p>
            Nombra hasta 3 <strong>sectores</strong> — cada uno cruzando dos variables (ej. Zona: urbana × Uso: comercial, no una sola) — que
            priorizarías para <strong>crecer</strong>, en orden de prioridad, y hasta 3 para <strong>disminuir</strong>. Todo lo que no nombres queda
            implícitamente en &ldquo;mantener&rdquo;.
          </p>
          <p>
            Se califica contra el ranking real de sectores de <strong>todo el mercado</strong>, que no ves directamente — tu propia cartera y el CSV
            público del universo (características de riesgo, sin resultados) son tu única evidencia. Acertar la dirección no basta: importa qué tan
            cerca quede tu prioridad (posición 1, 2 o 3) de la posición real de ese sector en el ranking verdadero.
          </p>
        </SubSection>
      </Section>

      <Section n="3" title="Conceptos que debes aplicar">
        <p className="text-[13px] italic text-[var(--color-brand-text-secondary)]">
          Esto es una guía de razonamiento, no una receta — identificar qué variables realmente definen un sector, y cómo tu portafolio afecta tu propia
          solvencia, es parte de lo que se evalúa que tu equipo descubra.
        </p>

        <SubSection title="Para la solvencia" accent="fin">
          <ul className="list-disc pl-5">
            <li>
              <strong>El riesgo financiero no es gratis, aunque el rendimiento haya sido bueno.</strong> Dos equipos con el mismo patrimonio pueden tener
              un RK muy distinto si uno concentró su portafolio en el instrumento más volátil del menú — revisa tu propia volatilidad realizada, no solo
              tu rendimiento, antes de reportar.
            </li>
            <li>
              <strong>El patrimonio que usas es el del año vigente, no un acumulado de todos los años.</strong> Si tuviste que comprometer Capital
              Social en algún año para cubrir una brecha de caja, eso ya redujo tu patrimonio en el Balance de ese año — revisa tu Balance de Día 3 antes
              de calcular tu solvencia.
            </li>
          </ul>
        </SubSection>

        <SubSection title="Para la recomendación sectorial" accent="act">
          <ul className="list-disc pl-5">
            <li>
              <strong>Un sector es un cruce de dos variables, no un nivel aislado.</strong> El mercado tiene interacciones reales entre variables de
              riesgo que un segmento univariado (ej. solo &ldquo;zona: urbana&rdquo;) no puede mostrar — mezcla combinaciones buenas y malas de esa misma
              zona, diluyendo la señal.
            </li>
            <li>
              <strong>No todas las variables disponibles definen igual de bien un sector de mercado.</strong> Piensa qué variables describen un segmento
              de negocio real (algo hacia lo que una aseguradora podría dirigir una estrategia comercial) frente a variables que describen más bien un
              riesgo individual de suscripción.
            </li>
            <li>
              <strong>La falta de información completa es parte del reto, no un obstáculo aparte.</strong> Tu propia cartera es una muestra sesgada del
              mercado (el mercado se reparte por precio, así que ganaste desproporcionadamente los riesgos que subvaloraste) — razona con eso en mente,
              no asumas que tu cartera representa al mercado completo.
            </li>
          </ul>
        </SubSection>
      </Section>

      <Section n="4" title="Plantillas — cómo se construye y cómo alimenta el resultado">
        <div>
          <p className="mb-1 text-xs font-semibold uppercase text-[var(--color-brand-text-secondary)]">4.1 · Solvencia — fórmulas</p>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            <ScoreCard label="Riesgo de suscripción (rSusc)" formula="√((prima×14.76%)² + (reservas×30%)² + 2×0.75×(prima×14.76%)×(reservas×30%))" />
            <ScoreCard label="Riesgo financiero (rFin)" formula="6.6% × inversiones × (tu volatilidad realizada ÷ volatilidad promedio del menú)" />
            <ScoreCard label="Riesgo operacional (rOp)" formula="3% × prima" />
            <ScoreCard label="Requerimiento de Capital (RK)" formula="combinación de rSusc/rFin/rOp vía matriz de correlación (rSusc-rFin=0.75, el resto=1)" />
            <ScoreCard label="Margen de solvencia" formula="Fondos propios (patrimonio) ÷ RK" />
            <ScoreCard label="Dividendo posible" formula="máx(0, Fondos propios − RK × 1.5)" />
          </div>
          <p className="mt-1 text-[11px] italic text-[var(--color-brand-text-secondary)]">
            &ldquo;Prima&rdquo;/&ldquo;reservas&rdquo;/&ldquo;inversiones&rdquo;/&ldquo;patrimonio&rdquo; son los mismos números de tu Balance del año
            vigente (Día 3) — no hay que recalcularlos desde cero.
          </p>
        </div>

        <div>
          <p className="mb-1 text-xs font-semibold uppercase text-[var(--color-brand-text-secondary)]">4.2 · Recomendación sectorial — plantilla en blanco</p>
          <p className="mb-2 text-xs text-[var(--color-brand-text-secondary)]">
            Variables disponibles para cruzar: {SECTOR_DIMENSIONS.map((d) => d.label).join(", ")}.
          </p>
          <BlankTable
            headers={["Prioridad", "Dimensión A", "Valor A", "Dimensión B", "Valor B"]}
            rows={3}
            note="Repite esta tabla para tu lista de crecer y tu lista de disminuir (hasta 3 posiciones cada una). Un sector siempre cruza dos dimensiones distintas."
          />
          <p className="mt-1 text-[11px] italic text-[var(--color-brand-text-secondary)]">
            Nota de calificación: acertar la posición exacta del sector real da 100 puntos para esa posición, decayendo linealmente hasta 0 conforme la
            diferencia de posición crece — nombrar un sector que ni siquiera aparece en el ranking real también da 0. Las posiciones que dejes en blanco
            simplemente no cuentan, ni para bien ni para mal.
          </p>
        </div>

        <div className="rounded border border-[var(--color-brand-gray-light)] p-3">
          <p className="mb-1 text-xs font-semibold uppercase text-[var(--color-brand-text-secondary)]">4.3 · El camino completo, de tus decisiones a tu nota</p>
          <p className="text-sm">
            Tu Balance de cada año (Día 3) + la volatilidad realizada de tu árbol de portafolio (Día 2) → alimentan el RK y tu margen de solvencia
            (4.1). En paralelo, tu lectura del mercado a través de tu propia cartera y el CSV público → tu recomendación sectorial (4.2), calificada
            contra el ranking real que nunca ves directamente.
          </p>
        </div>
      </Section>
    </div>
  );
}
