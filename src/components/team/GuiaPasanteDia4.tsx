import { SECTOR_DIMENSIONS } from "@/domain/grading/sectors";
import { InsumosEntregables, PreguntasAbiertas, FlowStep } from "./GuiaShared";

function Section({ n, title, children }: { n: string; title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-lg border border-[var(--color-brand-gray-light)] border-t-4 border-t-[var(--color-brand-gray-light)] bg-[var(--color-brand-surface)] p-5 print:break-inside-avoid">
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
      className={`rounded border-l-4 p-3 ${accent === "act" ? "border-l-[var(--color-brand-cyan)] bg-[var(--color-brand-cyan-light)]" : "border-l-[var(--color-brand-gray)] bg-[var(--color-brand-blue-light)]"}`}
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
      <p className="text-[14px] italic text-[var(--color-brand-text-secondary)]">{formula}</p>
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
      {note && <p className="text-[15px] italic text-[var(--color-brand-text-secondary)]">{note}</p>}
    </div>
  );
}

export function GuiaPasanteDia4() {
  return (
    <div className="flex flex-col gap-5 text-[var(--color-foreground)]">
      <header className="rounded-lg border-t-8 border-t-[var(--color-brand-gray)] bg-[var(--color-brand-surface)] p-6">
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
          "Volatilidad realizada y concentración de tu calendario de portafolio (Día 2).",
          "El menú de instrumentos que ya conoces (Día 1/2) — no hay curvas nuevas que memorizar: la nominal y la real salen de los mismos yields del menú.",
          "Tu propia cartera (parcial, sesgada) y el CSV público del universo, para la recomendación sectorial.",
        ]}
        entregables={[
          "σ de tu siniestralidad (volatilidad de prima/siniestralidad de Año 1, 2 y 3), Requerimiento de Capital (RK), Fondos propios, Margen de solvencia, Dividendo posible y EVA (Valor Económico Agregado).",
          "Riesgo de tasa, riesgo de inflación y riesgo de acciones, valorados al cierre de Año 2.",
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
        <p className="text-[15px] italic text-[var(--color-brand-text-secondary)]">
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
            normalizado a 1.0 como el promedio. Es la misma lógica de relatividades que ya usaste para tarificar en Día 1 (ver su glosario de
            términos), pero aplicada como herramienta de dirección estratégica de portafolio, no de precio individual: decidir qué segmentos crecer y
            cuáles evitar con evidencia parcial y sesgada (tu propia
            cartera, que ya sobrerrepresenta los riesgos que subvaloraste) es un problema estadístico real que enfrenta cualquier aseguradora al planear
            su book de negocio.
          </p>
        </SubSection>

        <SubSection title="Volatilidad de tu propia siniestralidad" accent="fin">
          <p>
            El riesgo de prima (parte del Requerimiento de Capital) no se calcula sobre un supuesto de volatilidad plano, igual para los 12 equipos —
            se calcula sobre <strong>tu propia</strong> volatilidad de siniestralidad realizada: qué tan dispersa quedó tu relación siniestros/prima
            (loss ratio) de un año a otro a lo largo de tus 3 años. Un equipo cuyo loss ratio se mantuvo estable entre Año 1, Año 2 y Año 3 tiene una
            operación más predecible — y por tanto un riesgo de prima más bajo — que uno cuyo loss ratio saltó de un año a otro, aunque ambos hayan
            terminado con la misma siniestralidad promedio.
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

        <SubSection title="Riesgo de tasa, riesgo de inflación y riesgo de acciones" accent="fin">
          <p>
            Hoy trabajas con dos curvas de descuento — no un solo número plano, sino una tasa que cambia según el plazo del flujo que estás
            valorando — y ninguna de las dos es nueva: ambas salen del mismo menú de instrumentos que ya conoces desde Día 1. La curva{" "}
            <strong>nominal</strong> son los yields de CDT90 (3 meses), TES1 (1 año) y TES3 (3 años), interpolados entre esos plazos. La curva{" "}
            <strong>real</strong> se ancla al yield real de TESUVR8 (el mismo &ldquo;Inflación + X%&rdquo; que ya ves en el menú de instrumentos, a
            su propio plazo de 8 años) — con un solo instrumento indexado a inflación en el menú, esa es tu única pista para despejar una inflación
            implícita (Fisher, ver abajo) en ese punto; la curva real completa sale de deflactar la curva nominal por esa misma inflación en
            cualquier otro plazo, no de restarle un número fijo.
          </p>
          <p>
            &ldquo;Interpolados entre esos plazos&rdquo; quiere decir <strong>interpolación lineal</strong>: para un plazo entre dos puntos dados
            (ej. 6 meses, entre CDT90 a 3 y TES1 a 12), la tasa es un promedio ponderado por qué tan cerca queda de cada uno —{" "}
            <em>tasa(plazo) = tasa_A + (plazo − plazo_A)/(plazo_B − plazo_A) × (tasa_B − tasa_A)</em>, con A el punto anterior y B el siguiente. Para
            un plazo antes de 3 meses o después de 36 meses (fuera del rango que cubren CDT90/TES1/TES3) se usa la tasa del punto dado más cercano,
            sin extrapolar más allá — así que, por ejemplo, el plazo remanente de una posición TESUVR8 que cae en la curva <strong>nominal</strong>{" "}
            (para el choque de riesgo de inflación, que sí mueve lo nominal) usa la tasa de TES3 si ese plazo supera los 36 meses.
          </p>
          <p>
            La relación entre ambas curvas (Fisher) es (1+nominal) = (1+real) × (1+inflación) — despejando, la curva de inflación implícita que tu
            equipo debe usar en cada plazo es (1+nominal)/(1+real) − 1. Nadie te entrega esa tercera curva directamente: se deriva de las otras dos,
            plazo por plazo.
          </p>
          <p>
            TESUVR8 es el único instrumento del menú indexado a UVR (inflación) — su valor presente se descuenta con la curva{" "}
            <strong>real</strong>, a su propio plazo remanente. Todo lo demás (CDT90/TES1/TES3, y tu pasivo de siniestros) se descuenta con la curva{" "}
            <strong>nominal</strong>, cada flujo a su propio plazo. Un choque de <strong>tasa</strong> mueve toda la curva real (y, por Fisher, la
            nominal con ella) — un choque de <strong>inflación</strong> mueve solo la curva de inflación implícita, dejando la curva real fija. Cuál
            de los dos choques te desfavorece depende de qué tanto de tu portafolio real (al cierre de Año 2) quedó en TESUVR8 frente a instrumentos
            nominales, comparado contra el perfil de tu pasivo — eso es lo que tu equipo tiene que descubrir, no algo que se te entrega.
          </p>
          <p>
            TES3 y TESUVR8 pagan cupón anual (ver Día 2), así que su valor presente no es un solo flujo al vencer: es la suma de cada cupón remanente
            más el principal del último pago, cada uno descontado a su propio plazo en la curva que le corresponde (nominal para TES3, real para
            TESUVR8) — el mismo tipo de cálculo &ldquo;cada flujo a su propio plazo&rdquo; que ya aplicas al pasivo, aplicado ahora también a estas dos
            posiciones. CDT90 y TES1 siguen siendo un único pago al vencer, sin cambios.
          </p>
          <p>
            El riesgo de acciones es más directo: tu exposición real en ACC al cierre de Año 2 (lo que efectivamente terminaste sosteniendo en ese
            instrumento, según tu propio calendario de Día 2) multiplicada por un cargo regulatorio fijo del 39% — el mismo tipo de cargo que Solvencia II
            exige para acciones cotizadas.
          </p>
          <p>
            &ldquo;Tu portafolio real al cierre de Año 2&rdquo; incluye tu Capital Social — se invierte según el mismo calendario que tu prima desde el
            arranque de 2027, no aparte de él (ver Balance, Día 3) — así que tu exposición en cada instrumento (TESUVR8, ACC, lo que sea) es mayor a
            lo que tu prima real sola habría financiado.
          </p>
        </SubSection>

        <SubSection title="Creación de valor económico (EVA)" accent="fin">
          <p>
            Utilidad neta positiva no significa, por sí sola, que una aseguradora creó valor: el patrimonio invertido en el negocio tiene un costo de
            oportunidad — lo que ese mismo capital habría podido rendir en un uso alternativo de riesgo comparable — y una utilidad que no supera ese
            costo destruye valor aunque el signo del resultado contable sea positivo. El EVA (Valor Económico Agregado) formaliza esa comparación:
            utilidad neta menos un cargo por costo de capital sobre los fondos propios.
          </p>
        </SubSection>
      </Section>

      <Section n="3" title="Qué se te va a calificar">
        <SubSection title="Solvencia y dividendos" accent="fin">
          <p>
            Reportas 9 líneas: tu <strong>σ de siniestralidad</strong>, el <strong>Requerimiento de Capital (RK)</strong>, tus{" "}
            <strong>Fondos propios</strong>, el <strong>Margen de solvencia</strong> (fondos propios ÷ RK), el <strong>Dividendo posible</strong>, el{" "}
            <strong>EVA (Valor Económico Agregado)</strong>, el <strong>Riesgo de tasa</strong>, el <strong>Riesgo de inflación</strong> y el{" "}
            <strong>Riesgo de acciones</strong> — cada una calificada por separado con una banda de tolerancia sobre el error relativo, igual que el
            resto de tus entregables numéricos.
          </p>
          <p>
            El Riesgo de tasa y el Riesgo de inflación se valoran al cierre de Año 2 — con las posiciones que tu portafolio real efectivamente tiene
            abiertas en ese momento y los flujos de tu pasivo de siniestros que todavía quedan por pagar después de ese punto, no con una simulación
            hipotética desde cero. El Riesgo de acciones es tu exposición real en ACC en ese mismo momento, multiplicada por el cargo regulatorio del
            39%.
          </p>
          <p>
            Tu <strong>σ de siniestralidad</strong> no se compara contra un valor del motor calculado aparte: se recalcula a partir de tus propias otras
            líneas ya reportadas — tu Costo de Siniestros y Prima Emitida de Año 1 (Día 2), Año 2 y Año 3 (Día 3). Para Año 1, usa tu propio Costo{" "}
            <strong>corregido</strong> por tu propio Ajuste de siniestralidad A1 (la misma corrección que ya reportaste en el Estado de resultados de
            Año 2, Día 3) — no tu cifra original de Día 2, que puede haber estado equivocada. El EVA tampoco se compara contra un valor del motor: se
            recalcula a partir de tu Utilidad Neta del año vigente de Día 3 y tus Fondos propios de hoy. En ambos casos, un error previo en alguna de
            esas líneas solo te penaliza una vez, no también aquí.
          </p>
          <p>
            El RK combina cinco riesgos (suscripción, financiero, operacional, concentración y acciones) — los que conectan directamente con tus
            propias decisiones anteriores son el de prima (tu propia σ de siniestralidad, arriba), el financiero, el de concentración y el de
            acciones, y son cosas distintas entre sí. El riesgo de prima escala con tu propia volatilidad de siniestralidad, no con un porcentaje
            plano. El riesgo financiero tampoco es un porcentaje plano sobre tus inversiones: se escala por qué tan volátil resultó realmente tu
            portafolio frente al promedio del menú de instrumentos. El riesgo de concentración es independiente de eso — se escala por qué tan
            repartido quedó tu calendario entre los instrumentos con plazo propio (CDT90/TES1/TES3/TESUVR8), sin importar si el instrumento elegido era
            volátil o no. Un equipo que puso todo en un solo CDT90 (bajo riesgo nominal) sigue pagando este segundo cargo completo, aunque su riesgo
            financiero sea bajo. El riesgo de acciones es, de los cuatro, el único que depende de un solo instrumento específico (ACC) y de un cargo
            fijo, no de una fórmula que combina varios factores tuyos. Ver sección 5 para las fórmulas completas.
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
        <p className="text-[15px] italic text-[var(--color-brand-text-secondary)]">
          Esto es una guía de razonamiento, no una receta — identificar qué variables realmente definen un sector, y cómo tu portafolio afecta tu propia
          solvencia, es parte de lo que se evalúa que tu equipo descubra.
        </p>

        <SubSection title="Para la solvencia" accent="fin">
          <ul className="list-disc pl-5">
            <li>
              <strong>Tu loss ratio de Año 1, para la σ de siniestralidad, no es tu Costo de Siniestros A1 original de Día 2.</strong> Es ese mismo
              Costo <strong>corregido</strong> por tu propio Ajuste de siniestralidad A1 (reportado en el Estado de resultados de Año 2, Día 3) — si
              olvidas aplicar esa corrección, tu σ (y por tanto tu riesgo de prima y tu RK) queda calculada sobre una siniestralidad de Año 1 que tú
              mismo ya sabes que era incorrecta.
            </li>
            <li>
              <strong>El riesgo financiero no es gratis, aunque el rendimiento haya sido bueno.</strong> Dos equipos con el mismo patrimonio pueden tener
              un RK muy distinto si uno concentró su portafolio en el instrumento más volátil del menú — revisa tu propia volatilidad realizada, no solo
              tu rendimiento, antes de reportar.
            </li>
            <li>
              <strong>Si tu nota de Rendimiento del Día 2 quedó más baja de lo esperado, revisa qué tan repartido quedó tu calendario.</strong> Ese mismo
              descuento por concentración reaparece aquí como un cargo de capital aparte del financiero — un CDT90 100% concentrado paga este cargo
              completo aunque su volatilidad sea baja. Entender esa conexión es lo que te permite reportar un RK correcto hoy, no solo recordar que tu
              nota de Día 2 fue más baja.
            </li>
            <li>
              <strong>El patrimonio que usas es el del año vigente, no un acumulado de todos los años.</strong> Si tuviste que comprometer Capital
              Social en algún año para cubrir una brecha de caja, eso ya redujo tu patrimonio en el Balance de ese año — revisa tu Balance de Día 3 antes
              de calcular tu solvencia.
            </li>
            <li>
              <strong>Una utilidad neta positiva no implica un EVA positivo.</strong> Si tu utilidad neta apenas superó (o quedó por debajo de) el 10%
              de tus fondos propios, tu EVA será bajo o negativo aunque tu Utilidad Neta A2 haya sido positiva — reporta el cálculo completo, no solo el
              signo de la utilidad.
            </li>
            <li>
              <strong>Ninguna de las dos curvas es un número nuevo que memorizar.</strong> La nominal son los yields de CDT90/TES1/TES3 que ya
              conoces, interpolados por plazo; la real se ancla al yield real de TESUVR8 (el mismo &ldquo;Inflación + X%&rdquo; del menú). La curva
              de inflación implícita que alimenta el choque de riesgo de inflación no está dada — se deriva de esas dos, plazo por plazo, vía Fisher.
            </li>
            <li>
              <strong>Riesgo de tasa y riesgo de inflación no afectan igual a todo tu portafolio.</strong> Solo TESUVR8 se descuenta con la curva
              real — todo lo demás (nominal) y tu pasivo de siniestros se mueven con la curva nominal. Qué tanto de tu portafolio real quedó en
              TESUVR8 frente a instrumentos nominales, al cierre de Año 2, determina cuál de los dos choques (y en qué dirección) te desfavorece más.
            </li>
            <li>
              <strong>El riesgo de tasa/inflación se valora con tu portafolio y pasivo reales al cierre de Año 2, no con la simulación ficticia de
              Día 2.</strong> Las posiciones que importan son las que tu calendario real todavía tiene abiertas en ese momento, y los flujos de siniestros
              (propios y de Año 1) que todavía quedan por pagar después de ese punto.
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
            <ScoreCard
              label="σ de siniestralidad (sol_sigmaLR)"
              formula="desviación estándar muestral (÷2, no ÷3) de [Costo A1 corregido ÷ Prima A1, Costo A2 ÷ Prima A2, Costo A3 ÷ Prima A3] — Costo A1 corregido = tu Costo de Siniestros A1 (Día 2) + tu Ajuste de siniestralidad A1 (Día 3)"
            />
            <ScoreCard label="Riesgo de prima (rPrimas)" formula="prima × tu propia σ de siniestralidad (sol_sigmaLR, arriba)" />
            <ScoreCard label="Riesgo de suscripción (rSusc)" formula="√(rPrimas² + (reservas×30%)² + 2×0.75×rPrimas×(reservas×30%))" />
            <ScoreCard label="Riesgo financiero (rFin)" formula="6.6% × inversiones × (tu volatilidad realizada ÷ volatilidad promedio del menú)" />
            <ScoreCard label="Riesgo operacional (rOp)" formula="3% × prima" />
            <ScoreCard
              label="Riesgo de concentración (rConcentracion)"
              formula="3% × inversiones × concentración de tu calendario (0 a 1, excluye LIQ — mismo número que descontó tu Rendimiento en Día 2)"
            />
            <ScoreCard label="Riesgo de acciones (rAcciones)" formula="tu exposición real en ACC al cierre de Año 2 × 39%" />
            <ScoreCard
              label="Requerimiento de Capital (RK)"
              formula="combinación de rSusc/rFin/rOp/rConcentracion/rAcciones vía matriz de correlación (rSusc-rFin=0.75, rSusc-rConcentracion=0.75, rSusc-rAcciones=0.75, rFin-rAcciones=0.75, rFin-rConcentracion=0.5, rConcentracion-rAcciones=0.5, el resto=1)"
            />
            <ScoreCard label="Margen de solvencia" formula="Fondos propios (patrimonio) ÷ RK" />
            <ScoreCard label="Dividendo posible" formula="máx(0, Fondos propios − RK × 1.5)" />
            <ScoreCard label="EVA (Valor Económico Agregado)" formula="Utilidad Neta (año vigente, Día 3) − 10% × Fondos propios" />
            <ScoreCard
              label="Curvas dadas"
              formula="nominal = yields de CDT90/TES1/TES3 por plazo, interpolación lineal entre puntos y plana fuera de [3,36] meses · inflación implícita = despéjala de (1+nominal)/(1+real) = (1+inflación) en el único plazo donde conoces las dos (TESUVR8, 96 meses) — luego es la misma en cualquier otro plazo · real = (1+nominal)/(1+inflación) − 1 en cada plazo (nunca una resta)"
            />
            <ScoreCard
              label="Riesgo de tasa"
              formula="peor de los dos choques (±20%/-15%) a la curva real, en NAV (PV activo real − PV pasivo real) al cierre de Año 2"
            />
            <ScoreCard
              label="Riesgo de inflación"
              formula="peor de los dos choques (±20%/-15%) a la curva de inflación implícita, en ese mismo NAV — TESUVR8 no se mueve con este choque"
            />
          </div>
          <p className="mt-1 text-[15px] italic text-[var(--color-brand-text-secondary)]">
            &ldquo;Prima&rdquo;/&ldquo;reservas&rdquo;/&ldquo;inversiones&rdquo;/&ldquo;patrimonio&rdquo; (fuera de la fórmula de σ) son los mismos
            números de tu Balance del año vigente (Día 3) — no hay que recalcularlos desde cero. La σ de siniestralidad es la única línea que mira los 3
            años a la vez en lugar de solo el año vigente. Riesgo de tasa, riesgo de inflación y riesgo de acciones son distintos a las demás líneas
            de esta tabla en un sentido: no salen de tu Balance de Día 3, sino de tu portafolio y pasivo <strong>reales</strong> al cierre de Año 2
            (las posiciones que tu calendario real todavía tiene abiertas en ese momento, no un número ya reportado en otro día).
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
          <p className="text-[15px] italic text-[var(--color-brand-text-secondary)]">
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
              Tu Balance de cada año (Día 3) + la volatilidad realizada y la concentración de tu calendario de portafolio (Día 2, la misma concentración que ya
              descontó tu nota de Rendimiento entonces) → alimentan el RK y tu margen de solvencia (5.1). En paralelo, tu lectura del mercado a través de
              tu propia cartera y el CSV público → tu recomendación sectorial (5.2), calificada contra el ranking real que nunca ves directamente.
            </p>
          </div>
        </FlowStep>
      </Section>
    </div>
  );
}
