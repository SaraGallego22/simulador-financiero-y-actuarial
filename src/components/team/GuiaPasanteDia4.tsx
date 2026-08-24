import { SECTOR_DIMENSIONS } from "@/domain/grading/sectors";
import { BlankTable, FlowStep, GuiaHeader, InsumosEntregables, PreguntasAbiertas, Section, SubSection, tableWrapClass } from "./GuiaShared";

function ScoreCard({ label, formula }: { label: string; formula: string }) {
  return (
    <div className={`${tableWrapClass} p-2`}>
      <p className="text-xs text-[var(--color-brand-text-secondary)]">{label}</p>
      <p className="my-1 flex h-8 items-center rounded-full border-2 border-dashed border-[var(--color-brand-gray-light)] px-3 font-[family-name:var(--font-condensed)] text-lg font-bold text-[var(--color-brand-text-secondary)]">
        &nbsp;
      </p>
      <p className="text-[14px] italic text-[var(--color-brand-text-secondary)]">{formula}</p>
    </div>
  );
}

export function GuiaPasanteDia4() {
  return (
    <div className="flex flex-col gap-8 text-[var(--color-foreground)]">
      <GuiaHeader
        dia={4}
        subtitulo="Solvencia, dividendos y analítica sectorial"
        intro="Esta es tu herramienta principal para abordar el reto de hoy. Léela antes de reportar tu solvencia o enviar tu recomendación sectorial: te explica exactamente qué se va a calificar, con qué criterios, y qué conceptos debes tener en cuenta."
      />

      <InsumosEntregables
        insumos={[
          "Balance de cada año (Día 3): reservas, RPND, cuentas por cobrar/pagar y patrimonio.",
          "Tu portafolio real al cierre de Año 2 (Día 2) — qué quedó en TESUVR8 frente a instrumentos nominales y en ACC, para riesgo de tasa/inflación/acciones.",
          "El menú de instrumentos que ya conoces (Día 1/2): la curva nominal y la real salen de esos mismos yields.",
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
            disminuir, en orden de prioridad, con tu propia cartera (parcial) y el CSV público del universo como única evidencia.
          </li>
        </ul>
      </Section>

      <Section n="2" title="Teoría necesaria">
        <p className="text-[15px] italic text-[var(--color-brand-text-secondary)]">
          Los sectores reales del mercado y los pesos exactos del modelo de solvencia los deduce tu equipo — esta sección explica el marco conceptual
          con el que se llega a ellos.
        </p>

        <SubSection title="Segmentación de mercado y rentabilidad por segmento" accent="act">
          <p>
            Tarificar bien a nivel de póliza individual (Día 1) y entender cómo se comporta el negocio a nivel de segmento de mercado son dos
            habilidades distintas. Un segmento (o &ldquo;sector&rdquo;) agrupa pólizas que comparten una combinación de características de negocio:
            cruzar dos dimensiones (por ejemplo, zona × uso del vehículo) revela interacciones que una variable sola diluye, porque mezcla
            combinaciones buenas y malas de esa misma variable.
          </p>
          <p>
            El indicador más directo para comparar la rentabilidad relativa de un segmento frente al resto del mercado es un multiplicador de
            siniestralidad — cuánto por encima o por debajo del promedio general queda la pérdida agregada (frecuencia × severidad) de ese segmento,
            normalizado a 1.0 como el promedio. Es la misma lógica de relatividades que ya usaste para tarificar en Día 1 (ver su glosario de
            términos), pero aplicada como herramienta de dirección estratégica de portafolio: decidir qué segmentos crecer y
            cuáles evitar con evidencia parcial y sesgada (tu propia
            cartera, que ya sobrerrepresenta los riesgos que subvaloraste) es un problema estadístico real que enfrenta cualquier aseguradora al planear
            su book de negocio.
          </p>
        </SubSection>

        <SubSection title="Volatilidad de tu propia siniestralidad" accent="fin">
          <p>
            El riesgo de prima (parte del Requerimiento de Capital) se calcula sobre <strong>tu propia</strong> volatilidad de siniestralidad
            realizada, específica de tu equipo: qué tan dispersa quedó tu relación siniestros/prima
            (loss ratio) de un año a otro a lo largo de tus 3 años. Un equipo cuyo loss ratio se mantuvo estable entre Año 1, Año 2 y Año 3 tiene una
            operación más predecible — y por tanto un riesgo de prima más bajo — que uno cuyo loss ratio saltó de un año a otro, aunque ambos hayan
            terminado con la misma siniestralidad promedio.
          </p>
        </SubSection>

        <SubSection title="Capital de solvencia y el beneficio de la diversificación" accent="fin">
          <p>
            Un marco de solvencia basado en riesgo (como el que sigue este ejercicio, inspirado en el estándar de Solvencia II europeo — su
            &ldquo;fórmula estándar&rdquo;) exige mantener capital suficiente para el escenario adverso combinado, reconociendo que los riesgos se
            materializan en momentos y direcciones distintos. El modelo se arma en dos niveles: primero, el <strong>Riesgo de Mercado</strong> (tasa,
            inflación y acciones) y el{" "}
            <strong>Riesgo de Suscripción</strong> (primas y reservas) se calculan cada uno por separado, combinando sus propios componentes
            internos mediante una matriz de correlación — cuanto menor la correlación asumida entre dos componentes, menor el capital combinado que
            exige el modelo frente a sumarlos linealmente. Esos dos resultados (Mercado y Suscripción) se combinan entre sí para dar el{" "}
            <strong>Básico</strong>, asumiendo esta vez correlación cero entre ambos — el mercado y la suscripción de un seguro de autos se mueven por
            motivos distintos, así que el modelo se queda con el beneficio de diversificación que ya capturó puertas adentro de cada uno. Por último,
            el <strong>Riesgo Operacional</strong> se suma al Básico de forma lineal y entera — el mismo tratamiento conservador que Solvencia II le da
            a este riesgo, sea cual sea el modelo interno de la aseguradora. Ese ahorro de capital (en Mercado y en Suscripción) es, literalmente, el
            beneficio de estar diversificado entre distintas fuentes de riesgo, más allá de los instrumentos financieros.
          </p>
          <p>
            El resultado — el Requerimiento de Capital, o RK (Básico + Operacional) — se compara contra los fondos propios reales de la aseguradora
            (su patrimonio) para obtener el margen de solvencia. Un margen por encima de 100% indica que hay más capital del mínimo exigido; ese
            excedente, descontado un margen de seguridad objetivo, es lo que queda disponible para repartir como dividendo sin comprometer la
            solvencia futura de la compañía.
          </p>
        </SubSection>

        <SubSection title="El tope de pólizas que ya viviste en Día 1 y Día 2" accent="fin">
          <p>
            El tope de cuota de mercado que limitó cuántas pólizas pudiste ganar en el mercado de 2027 (Día 1) y 2028 (Día 2) salía de resolver esta
            misma estructura de capital de riesgo (Suscripción + Financiero + Operacional, combinados por correlación) para la prima máxima que tu
            propio capital disponible podía sostener manteniendo un margen de solvencia de exactamente 100% (el piso regulatorio, frente al 150% que
            exige el dividendo de hoy). En ese momento del juego tus reservas y tu portafolio real todavía estaban por existir, así que el motor usa
            supuestos fijos (un loss ratio y un patrón de reserva de referencia, iguales para los 12 equipos) en lugar de tus cifras reales — por eso el
            resultado de hoy usa números distintos, aunque la forma sea la misma. Ver sección 5 para la fórmula exacta.
          </p>
          <p>
            En Día 1, tu capital disponible era el mismo Capital Social fijo para los 12 equipos ($116.000 millones), y tu volatilidad de portafolio
            venía de tu propia asignación de mínima varianza de ese mismo día. En Día 2, tu capital disponible pasó a ser tu patrimonio real de cierre
            de Año 1 — el que calculó el motor a partir del ALM real de Año 1 que sometiste ese mismo día, antes de tu Balance de Día 3 — así que un
            equipo que comprometió Capital Social en ese ALM para cubrir una caja entró a competir por pólizas de 2028 con menos
            margen para crecer; y tu volatilidad pasó a venir de la asignación del mes 0 de ese mismo calendario real.
          </p>
          <p>
            La prima máxima se convierte en pólizas máximas dividiendo entre tu propia prima promedio por póliza de ese año — dos equipos con el mismo
            capital disponible podían terminar con topes de pólizas distintos solo por haber cobrado primas promedio distintas.
          </p>
        </SubSection>

        <SubSection title="Riesgo de tasa, riesgo de inflación y riesgo de acciones" accent="fin">
          <p>
            Hoy trabajas con dos curvas de descuento: una tasa que cambia según el plazo del flujo que estás valorando. Las dos salen del mismo menú
            de instrumentos que ya conoces desde Día 1. La curva{" "}
            <strong>nominal</strong> son los yields de CDT90 (3 meses), TES1 (1 año) y TES3 (3 años), interpolados entre esos plazos. La curva{" "}
            <strong>real</strong> se ancla al yield real de TESUVR8 (el mismo &ldquo;Inflación + X%&rdquo; que ya ves en el menú de instrumentos, a
            su propio plazo de 8 años) — con un solo instrumento indexado a inflación en el menú, esa es tu única pista para despejar una inflación
            implícita (Fisher, ver abajo) en ese punto; la curva real completa sale de deflactar la curva nominal por esa misma inflación en
            cualquier otro plazo.
          </p>
          <p>
            &ldquo;Interpolados entre esos plazos&rdquo; quiere decir <strong>interpolación lineal</strong>: para un plazo entre dos puntos dados
            (ej. 6 meses, entre CDT90 a 3 y TES1 a 12), la tasa es un promedio ponderado por qué tan cerca queda de cada uno —{" "}
            <em>tasa(plazo) = tasa_A + (plazo − plazo_A)/(plazo_B − plazo_A) × (tasa_B − tasa_A)</em>, con A el punto anterior y B el siguiente. Para
            un plazo antes de 3 meses o después de 36 meses (fuera del rango que cubren CDT90/TES1/TES3) la curva se mantiene plana en la tasa del
            punto dado más cercano — así que, por ejemplo, el plazo remanente de una posición TESUVR8 que cae en la curva <strong>nominal</strong>{" "}
            (para el choque de riesgo de inflación, que sí mueve lo nominal) usa la tasa de TES3 si ese plazo supera los 36 meses.
          </p>
          <p>
            La relación entre ambas curvas (Fisher) es (1+nominal) = (1+real) × (1+inflación) — despejando, la curva de inflación implícita que tu
            equipo debe usar en cada plazo es (1+nominal)/(1+real) − 1. Esa tercera curva se deriva de las otras dos, plazo por plazo.
          </p>
          <p>
            TESUVR8 es el único instrumento del menú indexado a UVR (inflación) — su valor presente se descuenta con la curva{" "}
            <strong>real</strong>, a su propio plazo remanente. Todo lo demás (CDT90/TES1/TES3, y tu pasivo de siniestros) se descuenta con la curva{" "}
            <strong>nominal</strong>, cada flujo a su propio plazo. Un choque de <strong>tasa</strong> mueve toda la curva real (y, por Fisher, la
            nominal con ella) — un choque de <strong>inflación</strong> mueve solo la curva de inflación implícita, dejando la curva real fija. Cuál
            de los dos choques te desfavorece depende de qué tanto de tu portafolio real (al cierre de Año 2) quedó en TESUVR8 frente a instrumentos
            nominales, comparado contra el perfil de tu pasivo — eso es lo que tu equipo tiene que descubrir.
          </p>
          <p>
            TES3 y TESUVR8 pagan cupón anual (ver Día 2), así que su valor presente es la suma de cada cupón remanente más el principal del último
            pago, cada uno descontado a su propio plazo en la curva que le corresponde (nominal para TES3, real para TESUVR8) — el mismo tipo de
            cálculo &ldquo;cada flujo a su propio plazo&rdquo; que ya aplicas al pasivo, aplicado ahora también a estas dos posiciones. CDT90 y TES1
            siguen siendo un único pago al vencer.
          </p>
          <p>
            El riesgo de acciones es más directo: tu exposición real en ACC al cierre de Año 2 (lo que efectivamente terminaste sosteniendo en ese
            instrumento, según tu propio calendario de Día 2) multiplicada por un cargo fijo del 20% — el mismo tipo de choque de tipo &ldquo;q de
            acciones&rdquo; que un marco Solvencia II le exige a la renta variable, calibrado para este ejercicio.
          </p>
          <p>
            Riesgo de tasa, riesgo de inflación y riesgo de acciones son los tres componentes del <strong>Riesgo de Mercado</strong> — se combinan
            entre sí mediante su propia matriz de correlación, en lugar de sumarse: tasa e inflación correlacionan 0.5 (ambas se mueven, por distintos
            mecanismos, con la misma curva nominal — ver Fisher, arriba), y acciones correlaciona 0 con las dos, porque su choque regulatorio es
            independiente de las curvas de tasa/inflación de este ejercicio.
          </p>
          <p>
            &ldquo;Tu portafolio real al cierre de Año 2&rdquo; incluye tu Capital Social — se invierte según el mismo calendario que tu prima desde el
            arranque de 2027 (ver Balance, Día 3) — así que tu exposición en cada instrumento (TESUVR8, ACC, lo que sea) es mayor a lo que tu prima
            real sola habría financiado.
          </p>
        </SubSection>

        <SubSection title="Creación de valor económico (EVA)" accent="fin">
          <p>
            Una aseguradora crea valor cuando su utilidad supera el costo de oportunidad del patrimonio invertido en el negocio — lo que ese mismo
            capital habría podido rendir en un uso alternativo de riesgo comparable. Una utilidad que se queda por debajo de ese costo destruye valor
            aunque el resultado contable sea positivo. El EVA (Valor Económico Agregado) formaliza esa comparación: utilidad neta menos un cargo por
            costo de capital sobre los fondos propios.
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
            abiertas en ese momento y los flujos de tu pasivo de siniestros que todavía quedan por pagar después de ese punto. El Riesgo de acciones
            es tu exposición real en ACC en ese mismo momento, multiplicada por un cargo fijo del 20%.
            Los tres combinados (vía correlación, ver sección 5) son tu Riesgo de Mercado, uno de los dos insumos del RK.
          </p>
          <p>
            Tu <strong>σ de siniestralidad</strong> se recalcula a partir de tus propias otras líneas ya reportadas — tu Costo de Siniestros y Prima
            Emitida de Año 1 (Día 2), Año 2 y Año 3 (Día 3). Para Año 1, suma tu propio Costo más tu propio Ajuste de siniestralidad A1 (la misma
            liberación del 10% de reserva que ya reportaste en el Estado de resultados de Año 2, Día 3). El EVA se recalcula igual, a partir de tu
            Utilidad Neta del año vigente de Día 3 y tus Fondos propios de hoy. En ambos casos, un error previo en alguna de esas líneas te penaliza
            una sola vez.
          </p>
          <p>
            El RK se arma en dos niveles: <strong>Riesgo de Mercado</strong> (tasa, inflación, acciones) y <strong>Riesgo de Suscripción</strong>{" "}
            (prima, reservas) se combinan entre sí (correlación cero) para dar el <strong>Básico</strong>; el <strong>Riesgo Operacional</strong> se
            suma encima de forma lineal para dar el Total. El que conecta directamente con tu propia decisión de Día 1/2 es el de prima (tu propia σ
            de siniestralidad, arriba) dentro de Suscripción, y los tres de Mercado — todos distintos entre sí. El riesgo de prima escala con tu
            propia volatilidad de siniestralidad. Riesgo de tasa y riesgo de inflación son choques reales a tu portafolio y tu pasivo al cierre de
            Año 2 (ver sección 2): el efecto genuino de un choque de curva sobre cada posición y cada flujo de pasivo a su propio plazo. Riesgo de
            acciones es el único de los tres que depende de un solo instrumento específico (ACC) y de un cargo fijo. Ver sección 5 para las fórmulas
            completas.
          </p>
        </SubSection>

        <SubSection title="Recomendación sectorial" accent="act">
          <p>
            Nombra hasta 3 <strong>sectores</strong> — cada uno cruzando dos variables (ej. Zona: urbana × Uso: comercial) — que
            priorizarías para <strong>crecer</strong>, en orden de prioridad, y hasta 3 para <strong>disminuir</strong>. Todo lo que no nombres queda
            implícitamente en &ldquo;mantener&rdquo;. Para cada sector que nombres, estima también su <strong>multiplicador</strong> (qué tan por
            encima o por debajo del promedio del mercado queda su pérdida agregada — 1.0 es el promedio).
          </p>
          <p>
            Se califica contra el ranking real de sectores de <strong>todo el mercado</strong>, que se mantiene oculto — tu propia cartera y el CSV
            público del universo (características de riesgo) son tu evidencia. La calificación mira dos cosas a la vez: qué tan cerca quede tu
            prioridad (posición 1, 2 o 3) de la posición real de ese sector en el ranking verdadero, <strong>y</strong> qué tan cerca quede tu
            multiplicador estimado del real — nombrar el sector correcto sin estimar su multiplicador te da la mitad del puntaje de esa posición.
          </p>
        </SubSection>
      </Section>

      <Section n="4" title="Conceptos que debes aplicar">
        <p className="text-[15px] italic text-[var(--color-brand-text-secondary)]">
          Esto es una guía de razonamiento: identificar qué variables realmente definen un sector, y cómo tu portafolio afecta tu propia solvencia, es
          parte de lo que se evalúa que tu equipo descubra.
        </p>

        <SubSection title="Para la solvencia" accent="fin">
          <ul className="list-disc pl-5">
            <li>
              <strong>Tu loss ratio de Año 1, para la σ de siniestralidad, corrige el Costo de Siniestros A1 de Día 2.</strong> Es ese mismo
              Costo <strong>más</strong> tu propio Ajuste de siniestralidad A1 (reportado en el Estado de resultados de Año 2, Día 3): esa suma es la
              que incorpora la revisión actuarial del 10% a tu siniestralidad de Año 1, y con ella a tu σ, tu riesgo de prima y tu RK.
            </li>
            <li>
              <strong>El riesgo operacional es el mayor de dos cargos.</strong> Uno sobre tu prima emitida y otro sobre tu reserva técnica, ambos al
              cierre de Año 2 — revisa cuál de los dos domina en tu caso antes de reportar.
            </li>
            <li>
              <strong>Riesgo de Mercado y Riesgo de Suscripción se combinan de forma pitagórica en el Básico.</strong> El modelo asume correlación
              cero entre ambos, así que el Básico es la raíz de la suma de cuadrados, siempre menor o igual que su suma directa — un equipo con
              Mercado y Suscripción parecidos en magnitud paga menos capital combinado que uno con toda su exposición concentrada en uno solo de los
              dos.
            </li>
            <li>
              <strong>El patrimonio que usas es el del año vigente.</strong> Si tuviste que comprometer Capital Social en algún año para cubrir una
              brecha de caja, eso ya redujo tu patrimonio en el Balance de ese año — revisa tu Balance de Día 3 antes de calcular tu solvencia.
            </li>
            <li>
              <strong>El EVA se mide contra el 10% de tus fondos propios.</strong> Si tu utilidad neta apenas superó (o quedó por debajo de) ese
              umbral, tu EVA será bajo o negativo aun con una Utilidad Neta A2 positiva — reporta el cálculo completo.
            </li>
            <li>
              <strong>Las dos curvas salen de instrumentos que ya conoces.</strong> La nominal son los yields de CDT90/TES1/TES3, interpolados por
              plazo; la real se ancla al yield real de TESUVR8 (el mismo &ldquo;Inflación + X%&rdquo; del menú). La curva de inflación implícita que
              alimenta el choque de riesgo de inflación se deriva de esas dos, plazo por plazo, vía Fisher.
            </li>
            <li>
              <strong>Riesgo de tasa y riesgo de inflación afectan distinto a cada parte de tu portafolio.</strong> Solo TESUVR8 se descuenta con la
              curva real; todo lo demás y tu pasivo de siniestros se mueven con la nominal. Qué tanto de tu portafolio real quedó en TESUVR8 frente a
              instrumentos nominales, al cierre de Año 2, determina cuál de los dos choques (y en qué dirección) te desfavorece más.
            </li>
            <li>
              <strong>El riesgo de tasa/inflación se valora con tu portafolio y pasivo reales al cierre de Año 2.</strong> Las posiciones que importan
              son las que tu calendario real todavía tiene abiertas en ese momento, y los flujos de siniestros (propios y de Año 1) que todavía quedan
              por pagar después de ese punto.
            </li>
          </ul>
        </SubSection>

        <SubSection title="Para la recomendación sectorial" accent="act">
          <ul className="list-disc pl-5">
            <li>
              <strong>Un sector es un cruce de dos variables.</strong> El mercado tiene interacciones reales entre variables de riesgo que un
              segmento univariado (ej. solo &ldquo;zona: urbana&rdquo;) diluye, porque mezcla combinaciones buenas y malas de esa misma zona.
            </li>
            <li>
              <strong>Las variables disponibles definen un sector de mercado con distinta calidad.</strong> Piensa cuáles describen un segmento de
              negocio real (algo hacia lo que una aseguradora podría dirigir una estrategia comercial) y cuáles describen más bien un riesgo individual
              de suscripción.
            </li>
            <li>
              <strong>La información incompleta es parte del reto.</strong> Tu propia cartera es una muestra sesgada del mercado (el mercado se reparte
              por precio, así que ganaste desproporcionadamente los riesgos que subvaloraste) — razona con ese sesgo en mente al extrapolar al mercado
              completo.
            </li>
            <li>
              <strong>El multiplicador es una pérdida agregada relativa.</strong> Combina frecuencia y severidad de ese sector frente al promedio del
              mercado completo — puedes construir tu propia versión de este número usando tu cartera, con su sesgo, como punto de partida.
            </li>
            <li>
              <strong>Usa hasta 4 decimales en tu multiplicador estimado</strong> (ej. 1.3456) — refleja la precisión real de tu propio cálculo.
            </li>
          </ul>
        </SubSection>

        <PreguntasAbiertas>
          <li>¿Qué pasaría con tu RK si el regulador exigiera un margen de seguridad objetivo más alto que 1.5×?</li>
          <li>¿Cómo cambiaría tu recomendación sectorial si tuvieras acceso a la cartera completa del mercado, no solo la tuya?</li>
          <li>
            ¿Qué le dirías a la junta directiva de tu aseguradora sobre la relación entre qué tanto de tu portafolio de Día 2 quedó en TESUVR8 frente
            a instrumentos nominales, y el dividendo que pueden repartir hoy?
          </li>
          <li>¿Cómo afecta la cantidad de asegurados de un sector al análisis de su multiplicador?</li>
          <li>¿Cómo cambiarían tus multiplicadores si los construyeras con la severidad promedio del sector en vez de con su pérdida agregada total?</li>
          <li>
            ¿Qué tratamiento le diste a los valores nulos del universo que no era obligatorio corregir para este ejercicio? (por ejemplo, imputar el
            valor medio por tipo de vehículo tiene más mérito que usar el promedio general del universo)
          </li>
          <li>
            Compara tus sectores recomendados para crecer con las proyecciones que ya hiciste para 2029 en Día 3 — ¿qué le sugerirías modificar a
            esas proyecciones a la luz de esta analítica?
          </li>
          <li>¿Cómo se relaciona el tiempo entre la fecha del siniestro y la fecha de aviso con el monto del siniestro, y cómo explicarías ese comportamiento?</li>
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
            <ScoreCard
              label="Riesgo de tasa"
              formula="peor de los dos choques (+50%/-50%) a la curva real, en NAV (PV activo real − PV pasivo real) al cierre de Año 2"
            />
            <ScoreCard
              label="Riesgo de inflación"
              formula="peor de los dos choques (+75%/-75%) a la curva de inflación implícita, en ese mismo NAV — TESUVR8 conserva su valor bajo este choque"
            />
            <ScoreCard label="Riesgo de acciones (rAcciones)" formula="tu exposición real en ACC al cierre de Año 2 × 20%" />
            <ScoreCard
              label="Riesgo de Mercado (rMercado)"
              formula="combinación de riesgo de tasa/riesgo de inflación/rAcciones vía matriz de correlación (tasa-inflación=0.5, acciones-cualquiera=0)"
            />
            <ScoreCard label="Riesgo Básico" formula="√(rMercado² + rSusc²) — correlación cero entre Mercado y Suscripción" />
            <ScoreCard
              label="Riesgo operacional (rOp)"
              formula="máx(4% × prima emitida al cierre de Año 2, 1.3% × reserva técnica al cierre de Año 2)"
            />
            <ScoreCard label="Requerimiento de Capital (RK)" formula="Básico + Riesgo operacional (suma lineal, sin correlación)" />
            <ScoreCard label="Margen de solvencia" formula="Fondos propios (patrimonio) ÷ RK" />
            <ScoreCard label="Dividendo posible" formula="máx(0, Fondos propios − RK × 1.5)" />
            <ScoreCard label="EVA (Valor Económico Agregado)" formula="Utilidad Neta (año vigente, Día 3) − 10% × Fondos propios" />
            <ScoreCard
              label="Curvas dadas"
              formula="nominal = yields de CDT90/TES1/TES3 por plazo, interpolación lineal entre puntos y plana fuera de [3,36] meses · inflación implícita = despéjala de (1+nominal)/(1+real) = (1+inflación) en el único plazo donde conoces las dos (TESUVR8, 96 meses) — luego es la misma en cualquier otro plazo · real = (1+nominal)/(1+inflación) − 1 en cada plazo (siempre por cociente de Fisher)"
            />
          </div>
          <p className="mt-1 text-[15px] italic text-[var(--color-brand-text-secondary)]">
            &ldquo;Prima&rdquo;/&ldquo;reservas&rdquo;/&ldquo;inversiones&rdquo;/&ldquo;patrimonio&rdquo; (fuera de la fórmula de σ) son los mismos
            números de tu Balance del año vigente (Día 3), listos para usar. La σ de siniestralidad es la única línea que mira los 3 años a la vez en
            lugar de solo el año vigente. Riesgo de tasa, riesgo de inflación y riesgo de acciones se distinguen de las demás líneas de esta tabla en
            un punto: salen de tu portafolio y pasivo <strong>reales</strong> al cierre de Año 2 — las posiciones que tu calendario real todavía tiene
            abiertas en ese momento — en lugar de tu Balance de Día 3.
          </p>
        </FlowStep>

        <FlowStep n="2" title="5.1b · Referencia — el límite de pólizas de Día 1 y Día 2">
          <p className="text-[15px] italic text-[var(--color-brand-text-secondary)]">
            Material de referencia, sin calificación: la reconstrucción exacta de un límite que ya viviste, para que puedas relacionarlo con tus
            propias cifras de Día 1/Día 2. Usa una forma parecida a la de 5.1, pero con supuestos fijos (iguales para los 12 equipos) en lugar de tus
            reservas/inversiones reales — son componentes propios, distintos de los de la tabla de arriba.
          </p>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            <ScoreCard label="Reserva del límite" formula="79.6% × Prima (86.1% de patrón de reserva de referencia × 92.5% de loss ratio de referencia — un valor fijo, igual para los 12 equipos)" />
            <ScoreCard
              label="Riesgo de Suscripción del límite"
              formula="√((14.76%×Prima)² + (30%×Reserva del límite)² + 2×0.75×(14.76%×Prima)×(30%×Reserva del límite))"
            />
            <ScoreCard
              label="Inversiones del límite"
              formula="Reserva del límite + (30/365)×25%×Prima (CxP, cuentas por pagar sobre gastos: comisión + adquisición + administración) + tu capital disponible − 15%×Prima (caja) − (30/365)×Prima (CxC, cuentas por cobrar)"
            />
            <ScoreCard
              label="Riesgo Financiero del límite"
              formula="6.6% × Inversiones del límite × tu volRatio (tu volatilidad de portafolio ÷ la volatilidad promedio del menú de instrumentos)"
            />
            <ScoreCard label="Riesgo Operacional del límite" formula="3% × Prima" />
            <ScoreCard
              label="RK del límite"
              formula="√(Susc² + Fin² + Op² + 1.5×Susc×Fin + 2×Susc×Op + 2×Fin×Op) — misma matriz de correlación (Susc-Fin=0.75, Susc-Op=1, Fin-Op=1)"
            />
            <ScoreCard
              label="Prima máxima"
              formula="el valor de Prima que hace RK del límite = tu capital disponible (margen de solvencia = 100% exacto) — Prima aparece dentro de la raíz en varios términos a la vez, así que se resuelve numéricamente: se aproxima probando valores de Prima hasta que RK del límite converja a tu capital"
            />
            <ScoreCard label="Pólizas máximas" formula="⌊Prima máxima ÷ tu propia prima promedio por póliza de ese año⌋" />
            <ScoreCard
              label="Capital disponible"
              formula="Día 1: $116.000 millones (Capital Social, igual para los 12 equipos) · Día 2: tu patrimonio real de cierre de Año 1, el que calculó el motor a partir de tu ALM real de ese año"
            />
            <ScoreCard
              label="Tu volRatio"
              formula="Día 1: de tu asignación de mínima varianza (Día 1) · Día 2: del mes 0 de tu calendario real de portafolio (Día 2)"
            />
          </div>
        </FlowStep>

        <FlowStep n="3" title="5.2 · Recomendación sectorial — plantilla en blanco">
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
            sector real da 100 puntos, decayendo linealmente hasta 0 conforme la diferencia de posición crece; nombrar un sector ausente del ranking
            real da 0. La segunda mitad es el multiplicador estimado — se califica con la misma banda de tolerancia sobre el error relativo que el
            resto de tus entregables numéricos, y da 0 cuando el sector nombrado está fuera del ranking real o el multiplicador queda en blanco. Las
            posiciones que dejes en blanco por completo quedan fuera del cálculo.
          </p>
        </FlowStep>

        <FlowStep n="4" title="5.3 · El camino completo, de tus decisiones a tu nota" last>
          <div className="rounded border border-[var(--color-brand-gray-light)] p-3">
            <p className="text-sm">
              Tu Balance de cada año (Día 3) alimenta Riesgo de Suscripción; tu portafolio y pasivo reales al cierre de Año 2 (Día 2) alimentan Riesgo
              de Mercado — ambos se combinan en el Básico, y el Riesgo Operacional se suma encima → RK y tu margen de solvencia (5.1). En paralelo, tu
              lectura del mercado a través de tu propia cartera y el CSV público → tu recomendación sectorial (5.2), calificada contra el ranking real
              del mercado completo.
            </p>
          </div>
        </FlowStep>
      </Section>
    </div>
  );
}
