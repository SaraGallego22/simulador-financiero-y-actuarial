import { SECTOR_DIMENSIONS } from "@/domain/grading/sectors";
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

      <InsumosEntregables
        insumos={[
          "Balance de cada año (Día 3): reservas, RPND, cuentas por cobrar/pagar y patrimonio.",
          "Volatilidad realizada y concentración de tu árbol de portafolio (Día 2).",
          "Tu propia cartera (parcial, sesgada) y el CSV público del universo, para la recomendación sectorial.",
        ]}
        entregables={[
          "Requerimiento de Capital (RK), Fondos propios, Margen de solvencia y Dividendo posible.",
          "Hasta 3 sectores a crecer y hasta 3 a disminuir, cada uno con su multiplicador estimado.",
        ]}
      />

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

      <Section n="2" title="Teoría necesaria">
        <p className="text-[13px] italic text-[var(--color-brand-text-secondary)]">
          Los sectores reales del mercado y los pesos exactos del modelo de solvencia no se revelan — esta sección explica el marco conceptual, no la
          respuesta.
        </p>

        <SubSection title="Segmentación de mercado y rentabilidad por segmento" accent="act">
          <p>
            Tarificar bien a nivel de póliza individual (Día 1) no es lo mismo que entender cómo se comporta el negocio a nivel de segmento de mercado.
            Un segmento (o &ldquo;sector&rdquo;) agrupa pólizas que comparten una combinación de características de negocio — no es lo mismo que una
            sola variable de riesgo aislada: cruzar dos dimensiones (por ejemplo, zona × uso del vehículo) revela interacciones que una variable sola
            diluye, porque mezcla combinaciones buenas y malas de esa misma variable.
          </p>
          <p>
            El indicador más directo para comparar la rentabilidad relativa de un segmento frente al resto del mercado es un multiplicador de
            siniestralidad — cuánto por encima o por debajo del promedio general queda la pérdida agregada (frecuencia × severidad) de ese segmento,
            normalizado a 1.0 como el promedio. Es la misma lógica de relatividades de un GLM (Día 1) pero aplicada como herramienta de dirección
            estratégica de portafolio, no de precio individual: decidir qué segmentos crecer y cuáles evitar con evidencia parcial y sesgada (tu propia
            cartera, que ya sobrerrepresenta los riesgos que subvaloraste) es un problema estadístico real que enfrenta cualquier aseguradora al planear
            su book de negocio.
          </p>
        </SubSection>

        <SubSection title="Capital de solvencia y el beneficio de la diversificación" accent="fin">
          <p>
            Un marco de solvencia basado en riesgo (como el que sigue este ejercicio, inspirado en el estándar de Solvencia II europeo) no exige
            mantener capital igual a la suma de todo lo que podría salir mal — exige mantener capital suficiente para el escenario adverso combinado,
            reconociendo que no todos los riesgos se materializan al mismo tiempo ni en la misma dirección. Cada módulo de riesgo (suscripción,
            financiero, operacional, concentración) se calcula por separado y luego se agregan mediante una matriz de correlación: cuanto menor la
            correlación asumida entre dos riesgos, menor el capital combinado que exige el modelo frente a sumarlos linealmente — ese ahorro de capital
            es, literalmente, el beneficio de estar diversificado en distintas fuentes de riesgo, no solo en instrumentos financieros.
          </p>
          <p>
            El resultado — el Requerimiento de Capital, o RK — se compara contra los fondos propios reales de la aseguradora (su patrimonio) para
            obtener el margen de solvencia. Un margen por encima de 100% indica que hay más capital del mínimo exigido; ese excedente, descontado un
            margen de seguridad objetivo, es lo que queda disponible para repartir como dividendo sin comprometer la solvencia futura de la compañía.
          </p>
        </SubSection>
      </Section>

      <Section n="3" title="Qué se te va a calificar">
        <SubSection title="Solvencia y dividendos" accent="fin">
          <p>
            Reportas 4 líneas: el <strong>Requerimiento de Capital (RK)</strong>, tus <strong>Fondos propios</strong>, el{" "}
            <strong>Margen de solvencia</strong> (fondos propios ÷ RK) y el <strong>Dividendo posible</strong> — cada una calificada por separado con una
            banda de tolerancia sobre el error relativo, igual que el resto de tus entregables numéricos.
          </p>
          <p>
            El RK combina cuatro riesgos (suscripción, financiero, operacional y concentración) — los dos que conectan directamente con tu árbol de
            portafolio de Día 2 son el financiero y el de concentración, y son dos cosas distintas. El riesgo financiero no es un porcentaje plano sobre
            tus inversiones: se escala por qué tan volátil resultó realmente tu portafolio frente al promedio del menú de instrumentos. El riesgo de
            concentración es independiente de eso — se escala por qué tan repartido quedó tu árbol entre los instrumentos con plazo propio
            (CDT90/TES1/TES3/TESUVR8), sin importar si el instrumento elegido era volátil o no. Un equipo que puso todo en un solo CDT90 (bajo riesgo
            nominal) sigue pagando este segundo cargo completo, aunque su riesgo financiero sea bajo. Ver sección 5 para las fórmulas completas.
          </p>
        </SubSection>

        <SubSection title="Recomendación sectorial" accent="act">
          <p>
            Nombra hasta 3 <strong>sectores</strong> — cada uno cruzando dos variables (ej. Zona: urbana × Uso: comercial, no una sola) — que
            priorizarías para <strong>crecer</strong>, en orden de prioridad, y hasta 3 para <strong>disminuir</strong>. Todo lo que no nombres queda
            implícitamente en &ldquo;mantener&rdquo;. Para cada sector que nombres, estima también su <strong>multiplicador</strong> (qué tan por
            encima o por debajo del promedio del mercado queda su pérdida agregada — 1.0 es el promedio).
          </p>
          <p>
            Se califica contra el ranking real de sectores de <strong>todo el mercado</strong>, que no ves directamente — tu propia cartera y el CSV
            público del universo (características de riesgo, sin resultados) son tu única evidencia. Acertar la dirección no basta: importa qué tan
            cerca quede tu prioridad (posición 1, 2 o 3) de la posición real de ese sector en el ranking verdadero, <strong>y</strong> qué tan cerca
            quede tu multiplicador estimado del real — nombrar el sector correcto sin estimar su multiplicador solo te da la mitad del puntaje de esa
            posición.
          </p>
        </SubSection>
      </Section>

      <Section n="4" title="Conceptos que debes aplicar">
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
              <strong>Si tu nota de Rendimiento del Día 2 quedó más baja de lo esperado, revisa qué tan repartido quedó tu árbol.</strong> Ese mismo
              descuento por concentración reaparece aquí como un cargo de capital aparte del financiero — un CDT90 100% concentrado paga este cargo
              completo aunque su volatilidad sea baja. Entender esa conexión es lo que te permite reportar un RK correcto hoy, no solo recordar que tu
              nota de Día 2 fue más baja.
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
            <li>
              <strong>El multiplicador es una pérdida agregada relativa, no un nivel de precio.</strong> Combina frecuencia y severidad de ese sector
              frente al promedio del mercado completo — puedes construir tu propia versión de este número con tu cartera (aunque sesgada) como punto
              de partida, no partas de cero.
            </li>
          </ul>
        </SubSection>

        <PreguntasAbiertas>
          <li>¿Qué pasaría con tu RK si el regulador exigiera un margen de seguridad objetivo más alto que 1.5×?</li>
          <li>¿Cómo cambiaría tu recomendación sectorial si tuvieras acceso a la cartera completa del mercado, no solo la tuya?</li>
          <li>
            ¿Qué le dirías a la junta directiva de tu aseguradora sobre la relación entre la volatilidad de tu portafolio de Día 2 y el dividendo que
            pueden repartir hoy?
          </li>
        </PreguntasAbiertas>
      </Section>

      <Section n="5" title="Plantillas — cómo se construye y cómo alimenta el resultado">
        <FlowStep n="1" title="5.1 · Solvencia — fórmulas">
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            <ScoreCard label="Riesgo de suscripción (rSusc)" formula="√((prima×14.76%)² + (reservas×30%)² + 2×0.75×(prima×14.76%)×(reservas×30%))" />
            <ScoreCard label="Riesgo financiero (rFin)" formula="6.6% × inversiones × (tu volatilidad realizada ÷ volatilidad promedio del menú)" />
            <ScoreCard label="Riesgo operacional (rOp)" formula="3% × prima" />
            <ScoreCard
              label="Riesgo de concentración (rConcentracion)"
              formula="3% × inversiones × concentración de tu árbol (0 a 1, excluye LIQ — mismo número que descontó tu Rendimiento en Día 2)"
            />
            <ScoreCard
              label="Requerimiento de Capital (RK)"
              formula="combinación de rSusc/rFin/rOp/rConcentracion vía matriz de correlación (rSusc-rFin=0.75, rSusc-rConcentracion=0.75, rFin-rConcentracion=0.5, el resto=1)"
            />
            <ScoreCard label="Margen de solvencia" formula="Fondos propios (patrimonio) ÷ RK" />
            <ScoreCard label="Dividendo posible" formula="máx(0, Fondos propios − RK × 1.5)" />
          </div>
          <p className="mt-1 text-[11px] italic text-[var(--color-brand-text-secondary)]">
            &ldquo;Prima&rdquo;/&ldquo;reservas&rdquo;/&ldquo;inversiones&rdquo;/&ldquo;patrimonio&rdquo; son los mismos números de tu Balance del año
            vigente (Día 3) — no hay que recalcularlos desde cero.
          </p>
        </FlowStep>

        <FlowStep n="2" title="5.2 · Recomendación sectorial — plantilla en blanco">
          <p className="text-xs text-[var(--color-brand-text-secondary)]">
            Variables disponibles para cruzar: {SECTOR_DIMENSIONS.map((d) => d.label).join(", ")}.
          </p>
          <BlankTable
            headers={["Prioridad", "Dimensión A", "Valor A", "Dimensión B", "Valor B", "Multiplicador estimado"]}
            rows={3}
            note="Repite esta tabla para tu lista de crecer y tu lista de disminuir (hasta 3 posiciones cada una). Un sector siempre cruza dos dimensiones distintas."
          />
          <p className="text-[11px] italic text-[var(--color-brand-text-secondary)]">
            Nota de calificación: cada posición nombrada vale por dos mitades, 50/50. La primera mitad es la posición — acertar la posición exacta del
            sector real da 100 puntos, decayendo linealmente hasta 0 conforme la diferencia de posición crece; nombrar un sector que ni siquiera
            aparece en el ranking real también da 0. La segunda mitad es el multiplicador estimado — se califica con la misma banda de tolerancia
            sobre el error relativo que el resto de tus entregables numéricos, y da 0 si el sector nombrado no está en el ranking real o si dejaste el
            multiplicador en blanco. Las posiciones que dejes en blanco por completo simplemente no cuentan, ni para bien ni para mal.
          </p>
        </FlowStep>

        <FlowStep n="3" title="5.3 · El camino completo, de tus decisiones a tu nota" last>
          <div className="rounded border border-[var(--color-brand-gray-light)] p-3">
            <p className="text-sm">
              Tu Balance de cada año (Día 3) + la volatilidad realizada y la concentración de tu árbol de portafolio (Día 2, la misma concentración que ya
              descontó tu nota de Rendimiento entonces) → alimentan el RK y tu margen de solvencia (5.1). En paralelo, tu lectura del mercado a través de
              tu propia cartera y el CSV público → tu recomendación sectorial (5.2), calificada contra el ranking real que nunca ves directamente.
            </p>
          </div>
        </FlowStep>
      </Section>
    </div>
  );
}
