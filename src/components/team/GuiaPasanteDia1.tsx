import { INSTRUMENTS } from "@/domain/finance/instruments";
import {
  BlankTable,
  DataDictTable,
  FlagCallout,
  FlowStep,
  GlossaryTable,
  GuiaHeader,
  InfoNote,
  InsumosEntregables,
  InstrumentsTable,
  MatrixTable,
  PreguntasAbiertas,
  Section,
  SubSection,
} from "./GuiaShared";

export function GuiaPasanteDia1() {
  return (
    <div className="flex flex-col gap-8 text-[var(--color-foreground)]">
      <GuiaHeader
        dia={1}
        subtitulo="Tarificación 2027 y portafolio de mínima varianza"
        intro="Esta es tu herramienta principal para abordar el reto de hoy. Léela antes de subir tu tarifa o construir tu portafolio: te explica exactamente qué se va a calificar, con qué criterios, y qué conceptos debes tener en cuenta para tomar buenas decisiones."
      />

      <InsumosEntregables
        insumos={[
          "Universo público de 1.000.000 exposiciones (13 variables de riesgo, sin resultados) — descargable desde la página del día.",
          "Dataset de referencia Chile (100.000 pólizas con siniestros reales) — misma página.",
          "Matriz de covarianza de los 6 instrumentos financieros y el rendimiento esperado objetivo de tu portafolio — formulario del portafolio.",
        ]}
        entregables={["CSV de tarifa: id_expuesto, prima — una fila por cada exposición del universo.", "Portafolio de mínima varianza: un peso (%) por instrumento, que sume 100%."]}
      />

      <Section n="1" title="Contexto del día">
        <p>
          El reto simula 2 años de operación de una aseguradora de autos, repartidos en 4 días de trabajo. Tu equipo compite contra los demás equipos del
          cohorte por una porción de un mercado sintético de 1.000.000 de pólizas de auto en Colombia — cada póliza tiene características de riesgo reales
          (edad del conductor, zona, tipo de vehículo, antigüedad, kilometraje, historial de siniestros, valor asegurado, uso, tipo de parqueadero, nivel
          educativo, estrato, género, marca).
        </p>
        <p>Hoy tomas dos decisiones independientes que definen el punto de partida de todo lo que sigue:</p>
        <ul className="list-disc pl-5">
          <li>
            <strong>Actuarial — la tarifa del 2027.</strong> Fijas el precio de cada póliza. Al cerrar el día, todos los equipos entran a un mercado
            simultáneo: cada asegurado elige la aseguradora que más le conviene, y el resultado (cuántas pólizas ganaste, con qué nivel de riesgo) queda
            fijado para el resto del ejercicio — es la base de todo lo que vas a reportar el resto del ejercicio.
          </li>
          <li>
            <strong>Financiero — el portafolio de mínima varianza.</strong> Antes de escribir cualquier póliza, demuestra que puedes construir un
            portafolio rentable con riesgo controlado — una decisión aparte de cómo inviertas tu presupuesto real más adelante en el ejercicio. Este
            portafolio de mínima varianza también alimenta tu tope de cuota de mercado del 2027 (ver sección 3).
          </li>
        </ul>
      </Section>

      <Section n="2" title="Teoría necesaria">
        <p className="text-[15px] italic text-[var(--color-brand-text-secondary)]">
          El modelo exacto (qué variables usar, con qué forma funcional, con qué parámetros) lo decide tu equipo, y distintos enfoques razonables
          pueden llegar a tarifas distintas. Esta sección te da los datos y el marco conceptual sobre el que se construye cualquier estimación
          razonable.
        </p>

        <SubSection title="Diccionario de datos — universo Colombia" accent="act">
          <p>Las 1.000.000 exposiciones del universo público llegan en un CSV con estas columnas, todas de características de riesgo:</p>
          <DataDictTable
            rows={[
              { col: "id_expuesto", desc: "Identificador único de la exposición", rango: "1 a 1.000.000" },
              { col: "edad", desc: "Edad del conductor", rango: "18 a 75 años" },
              { col: "tipo", desc: "Tipo de vehículo", rango: "sedan, suv, pickup, deportivo, compacto, van" },
              { col: "zona", desc: "Zona de circulación", rango: "urbana, suburbana, rural" },
              { col: "antig", desc: "Antigüedad del vehículo", rango: "0 a 20 años" },
              { col: "km", desc: "Kilometraje anual", rango: "5.000 a 120.000 km" },
              { col: "hist", desc: "Historial de siniestros previos (antes de este ejercicio)", rango: "0 a 5" },
              { col: "valor", desc: "Valor asegurado del vehículo", rango: "≈ $8.000.000 a $300.000.000 COP" },
              { col: "uso", desc: "Uso del vehículo", rango: "personal, comercial, mixto" },
              { col: "parq", desc: "Tipo de parqueadero", rango: "si, no" },
              { col: "edu", desc: "Nivel educativo del conductor", rango: "basica, tecnica, universitaria, posgrado" },
              { col: "estrato", desc: "Estrato socioeconómico", rango: "1 a 6" },
              { col: "genero", desc: "Género del conductor", rango: "M, F" },
              { col: "marca", desc: "Marca del vehículo", rango: "chevrolet, renault, mazda, toyota, nissan, hyundai, kia, ford" },
            ]}
          />
        </SubSection>

        <SubSection title="Diccionario de datos — dataset Chile (referencia)" accent="act">
          <p>
            100.000 pólizas con 3 años de siniestros reales (2021-2023) — este dataset sí trae resultados. Sus valores monetarios están en{" "}
            <strong>UF</strong> (Unidad de Fomento, la unidad chilena indexada a la inflación); llevarlos a pesos colombianos exige incorporar la
            inflación de forma explícita, y la esperada en Colombia para 2027-2028 es del 6% anual.
          </p>
          <DataDictTable
            rows={[
              { col: "id_poliza", desc: "Identificador único de la póliza", rango: "1 a 100.000" },
              { col: "edad_conductor", desc: "Edad del conductor", rango: "18 a 75 años" },
              { col: "tipo_vehiculo", desc: "Tipo de vehículo", rango: "sedan, suv, pickup, station_wagon, furgon, compacto" },
              { col: "zona", desc: "Zona de circulación", rango: "metropolitana, norte, centro, sur, austral" },
              { col: "antiguedad_vehiculo", desc: "Antigüedad del vehículo", rango: "0 a 20 años" },
              { col: "kilometraje_anual", desc: "Kilometraje anual", rango: "5.000 a 120.000 km" },
              { col: "siniestros_previos", desc: "Historial de siniestros previos", rango: "0 a 5" },
              { col: "valor_comercial_uf", desc: "Valor comercial del vehículo, en UF", rango: "≈ 50 a 2.250 UF" },
              { col: "uso_vehiculo", desc: "Uso del vehículo", rango: "particular, comercial, taxi, uber" },
              { col: "caja_automatica", desc: "Si el vehículo tiene caja automática", rango: "si, no" },
              { col: "seguro_complementario", desc: "Si la póliza incluye un seguro complementario", rango: "si, no" },
              { col: "genero", desc: "Género del conductor", rango: "M, F" },
              { col: "comuna_tipo", desc: "Tipo de comuna donde circula el vehículo", rango: "gran_ciudad, ciudad_media, rural" },
              { col: "siniestro_2021 / _2022 / _2023", desc: "Si la póliza tuvo un siniestro ese año", rango: "1 (sí), 0 (no)" },
              { col: "fecha_siniestro_2021 / _2022 / _2023", desc: "Fecha en que ocurrió el siniestro (vacío si no hubo)", rango: "AAAA-MM-DD" },
              { col: "monto_uf_2021 / _2022 / _2023", desc: "Monto del siniestro, en UF (vacío si no hubo)", rango: "> 0 UF" },
            ]}
          />
          <InfoNote>
            <p className="mb-1 text-xs font-semibold uppercase text-[var(--color-brand-blue-accent)]">El desafío de transferibilidad</p>
            <p className="text-xs text-[var(--color-brand-text-secondary)]">
              Este dataset está en UF y corresponde a 2021-2023 — varios años antes de 2027, el año de este ejercicio. Usarlo como
              referencia de severidad para tu propia tarifa exige resolver dos brechas distintas:
            </p>
            <ul className="mt-1 list-disc pl-5 text-xs text-[var(--color-brand-text-secondary)]">
              <li>
                <strong>Brecha temporal, dentro de Chile mismo.</strong> La UF ya está indexada a la inflación chilena: por diseño, su
                poder adquisitivo real se mantiene constante en el tiempo. Lo que cambia año a año es el costo real de reparar un
                vehículo (repuestos, mano de obra), medido en UF — compara la severidad promedio de 2021, 2022 y 2023 en el CSV para
                estimar esa tendencia, y proyéctala los años que faltan hasta 2027.
              </li>
              <li>
                <strong>Brecha de moneda, entre Chile y Colombia.</strong> Esa severidad proyectada a 2027 sigue expresada en UF: falta
                convertirla a pesos colombianos para que sea comparable con tu propio modelo de severidad. Esa tasa de conversión es
                información pública que puedes investigar, igual que un actuario real lo haría antes de usar un dataset de otro país
                como referencia.
              </li>
            </ul>
          </InfoNote>
        </SubSection>

        <SubSection title="De la prima pura a la prima comercial" accent="act">
          <p>
            La <strong>prima pura</strong> (o prima de riesgo) es el costo esperado puro de un riesgo — frecuencia esperada × severidad esperada —
            sin ningún cargo comercial todavía. La <strong>prima comercial</strong> es lo que efectivamente le cobras al cliente: la prima pura,
            cargada para cubrir los gastos de operar el negocio y dejar un margen de utilidad.
          </p>
          <div className="rounded border border-[var(--color-brand-gray-light)] bg-[var(--color-brand-blue-light)] p-4 text-center">
            <p className="font-[family-name:var(--font-condensed)] text-base font-bold text-[var(--color-brand-blue-accent)] sm:text-lg">
              Prima Comercial = Prima Pura ÷ (1 − % Gastos − % Utilidad)
            </p>
          </div>
          <p>Los conceptos que componen ese denominador, con los valores reales que usa este ejercicio:</p>
          <div className="overflow-x-auto">
            <table className="w-full border-collapse border border-[var(--color-brand-gray-light)] text-xs">
              <thead>
                <tr>
                  {["Concepto", "% de la prima comercial", "Qué es"].map((h) => (
                    <th key={h} className="border border-[var(--color-brand-gray-light)] bg-[var(--color-brand-blue-light)] px-2 py-1.5 text-left font-semibold text-[var(--color-brand-blue-accent)]">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td className="border border-[var(--color-brand-gray-light)] px-2 py-1.5 font-semibold">Gasto de adquisición</td>
                  <td className="border border-[var(--color-brand-gray-light)] px-2 py-1.5">4%</td>
                  <td className="border border-[var(--color-brand-gray-light)] px-2 py-1.5">Costo de originar la póliza: estudio del riesgo, emisión, documentación.</td>
                </tr>
                <tr>
                  <td className="border border-[var(--color-brand-gray-light)] px-2 py-1.5 font-semibold">Comisiones</td>
                  <td className="border border-[var(--color-brand-gray-light)] px-2 py-1.5">15%</td>
                  <td className="border border-[var(--color-brand-gray-light)] px-2 py-1.5">Pago al canal o intermediario que vendió la póliza.</td>
                </tr>
                <tr>
                  <td className="border border-[var(--color-brand-gray-light)] px-2 py-1.5 font-semibold">Gasto administrativo</td>
                  <td className="border border-[var(--color-brand-gray-light)] px-2 py-1.5">6%</td>
                  <td className="border border-[var(--color-brand-gray-light)] px-2 py-1.5">Costos de operar la aseguradora, no ligados a una póliza en particular: nómina, sistemas, oficinas.</td>
                </tr>
                <tr>
                  <td className="border border-[var(--color-brand-gray-light)] px-2 py-1.5 font-semibold">Margen de utilidad de referencia</td>
                  <td className="border border-[var(--color-brand-gray-light)] px-2 py-1.5">20%</td>
                  <td className="border border-[var(--color-brand-gray-light)] px-2 py-1.5">
                    Rentabilidad que la aseguradora espera obtener sobre la prima, antes de conocer el resultado real del año — el mismo 20% que
                    reaparece en la sección 3 como el margen técnico de referencia de un &ldquo;buen desempeño&rdquo; (nota 75).
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
          <p className="text-[15px] italic text-[var(--color-brand-text-secondary)]">
            Con estos valores, el denominador de la fórmula es 1 − 25% − 20% = 0.55. Esto carga tu prima pura de forma pareja para todo el libro;
            cuánto debe pagar cada póliza frente a otra lo decide tu propio modelo de frecuencia/severidad, abajo.
          </p>
        </SubSection>

        <SubSection title="Frecuencia × severidad: el costo esperado de un riesgo" accent="act">
          <p>
            La forma clásica de tarificar un riesgo asegurable descompone su costo esperado en dos preguntas independientes: ¿qué tan probable es que
            ocurra un siniestro? (frecuencia) y, si ocurre, ¿cuánto cuesta? (severidad). El costo esperado — la prima pura — es el producto de las
            dos: <code className="rounded bg-black/5 px-1">E[costo] = E[frecuencia] × E[severidad]</code>. Mantenerlas separadas importa porque
            responden a mecanismos distintos y pueden moverse en direcciones opuestas: un conductor más joven puede tener mayor frecuencia de
            siniestro y una severidad promedio parecida a la del resto del libro.
          </p>
        </SubSection>

        <SubSection title="Portafolio de mínima varianza (teoría de Markowitz)" accent="fin">
          <p>
            El marco de Markowitz parte de una idea poco intuitiva a primera vista: el riesgo (varianza) de un portafolio depende de cómo covarían
            entre sí los instrumentos que lo componen, más allá de la varianza de cada uno por separado. Combinar instrumentos con correlación baja, o
            negativa, puede reducir la varianza total del portafolio por debajo de la de cualquiera de sus componentes individuales, manteniendo el
            rendimiento esperado — ese es, en esencia, el beneficio de diversificar.
          </p>
          <p>
            Para cada nivel de rendimiento esperado que te propongas alcanzar existe una combinación de pesos que minimiza la varianza resultante — el
            conjunto de esos puntos (uno por cada rendimiento posible) se llama la frontera eficiente. Un &ldquo;portafolio de mínima varianza sujeto a
            un rendimiento objetivo&rdquo; es exactamente un punto sobre esa frontera: la combinación de pesos que, entre todas las que alcanzan el
            rendimiento que te piden, tiene la menor varianza posible — un problema de optimización cuadrática (minimizar w<sup>T</sup>Σw sujeto a que
            los pesos sumen 100% y el rendimiento esperado ponderado alcance el objetivo, con Σ la matriz de covarianza).
          </p>
        </SubSection>

        <SubSection title="Glosario de términos actuariales" accent="act">
          <GlossaryTable
            rows={[
              { term: "Exposición", def: "Unidad de riesgo asegurada durante un período — aquí, una póliza-año dentro del universo." },
              { term: "Siniestro", def: "La ocurrencia de un evento cubierto por la póliza que genera una reclamación." },
              { term: "Frecuencia", def: "Probabilidad (o tasa esperada) de que una exposición tenga al menos un siniestro en el período." },
              { term: "Severidad", def: "Costo esperado de un siniestro, dado que ya ocurrió." },
              { term: "Prima pura (o de riesgo)", def: "Costo esperado de un riesgo — frecuencia × severidad — sin ningún cargo comercial." },
              { term: "Prima comercial", def: "Prima pura cargada con gastos y margen de utilidad — lo que efectivamente se cobra al cliente." },
              {
                term: "Relatividad",
                def: "Factor que ajusta la tasa base de un riesgo según una característica particular (p. ej., 1.2 si esa característica sube el riesgo un 20% sobre el promedio del libro).",
              },
              {
                term: "Selección adversa",
                def: "Cuando una tarifa mal segmentada atrae desproporcionadamente a los riesgos que más le convienen al asegurado y menos a la aseguradora.",
              },
              { term: "Tarificar", def: "Fijar el precio de una póliza a partir de su riesgo esperado." },
              { term: "Cuota de mercado", def: "Porción del total de exposiciones del mercado que termina asegurando un equipo." },
            ]}
          />
        </SubSection>
      </Section>

      <Section n="3" title="Qué se te va a calificar">
        <SubSection title="Tarifa 2027" accent="act">
          <p>
            Debes subir un CSV con dos columnas — <code className="rounded bg-black/5 px-1">id_expuesto,prima</code> — con una prima para cada una de las
            1.000.000 exposiciones del universo público (descargable desde la página de este día).
          </p>
          <p>
            <strong>Tu tarifa se evalúa por cómo le va en el mercado.</strong> Al cierre del día se corre un mercado de elección: cada
            asegurado compara el precio que le ofrece cada equipo y elige racionalmente (con algo de ruido aleatorio y cierta inercia hacia su aseguradora
            actual), sujeto a un tope de cuota de mercado por equipo: al llegar a ese tope, el exceso de demanda se redistribuye entre los equipos que
            todavía tienen cupo disponible.
          </p>
          <p>
            Tu nota actuarial del día depende de tu resultado técnico (prima devengada − siniestros − gastos de adquisición/comisión — el gasto
            administrativo se resta más abajo, en su propia línea, el Resultado Industrial), comparado contra un desempeño de referencia fijo que define
            el propio modelo, igual para todos los equipos. La prima devengada es la porción de la prima que ya se considera ganada: como en cualquier
            aseguradora, la parte que todavía cubre riesgo futuro se reserva como Reserva de Prima No Devengada (RPND) — para tu primer año, la prima
            devengada es el 80% de lo que efectivamente cobraste (más detalle en la guía de Día 2, cuando armes tu propio P&amp;G). Precios muy altos
            pierden clientes (y con ellos, ingreso); precios muy bajos ganan volumen, pero pueden hundir el resultado técnico si atraen selectivamente
            el riesgo equivocado — y los gastos, al ser un porcentaje fijo de la prima cobrada, pesan más cuanto más barato cobres.
          </p>
          <ul className="list-disc pl-5">
            <li>Resultado técnico en cero (ni ganancia ni pérdida, ya descontados los gastos) → nota 50.</li>
            <li>Resultado técnico positivo → nota por encima de 50, acercándose a 100 mientras mejor sea tu margen.</li>
            <li>Resultado técnico negativo → nota por debajo de 50, acercándose a 0 mientras peor sea (0 es el piso de la escala).</li>
            <li>
              El &ldquo;buen desempeño&rdquo; de referencia (el que da una nota de 75) es un margen técnico neto del 20% sobre la prima cobrada, después
              de siniestros, la RPND y gastos — un porcentaje calculado sobre tu propia siniestralidad real, para que un equipo con una cartera chica y
              uno con una grande se midan con la misma vara relativa.
            </li>
          </ul>
          <p className="text-[15px] italic text-[var(--color-brand-text-secondary)]">
            Si tu equipo no alcanza a completar su tarifa a tiempo, el formulario de tarifa tiene una opción de emergencia — &ldquo;Tercerizar
            tarifas&rdquo; — que contrata a una consultora chilena, sin experiencia en el mercado colombiano, para definirla por ustedes. Les permite seguir
            participando en el mercado de ese día; el costo de esa consultoría corre por cuenta del equipo, y el detalle de la tarifa asignada solo se
            revela una vez el mercado de ese día cierre. Aplica igual en el 2028.
          </p>
          <p className="text-[15px] italic text-[var(--color-brand-text-secondary)]">
            Para calibrar tu propio modelo de frecuencia y severidad tienes disponible, además del universo público, un dataset de referencia con
            siniestros reales (dataset Chile, 100.000 pólizas, descargable desde la página de este día) — juzgar qué variables aplican a
            Colombia y cómo ajustarlas es parte del reto.
          </p>
        </SubSection>

        <SubSection title="Portafolio de mínima varianza" accent="fin">
          <p>
            Asignas un peso (que debe sumar 100%) entre los instrumentos disponibles (tabla en la sección 5) buscando el <strong>menor riesgo posible</strong>{" "}
            — medido como la varianza del portafolio, usando la matriz de covarianza que se te da en el formulario — sujeto a alcanzar al menos un{" "}
            <strong>rendimiento esperado objetivo</strong>. Es una asignación de pesos, de una sola vez — una fotografía de cómo invertirías el capital
            hoy mismo, antes de saber cuánta prima vas a cobrar o cuántos siniestros vas a pagar.
          </p>
          <p>
            Tu nota compara la varianza que realmente lograste contra la varianza mínima real (la que un portafolio óptimo habría logrado con el mismo
            rendimiento objetivo) — mientras más cerca de esa varianza mínima, mejor tu nota.
          </p>
          <p className="text-[15px] italic text-[var(--color-brand-text-secondary)]">
            Este portafolio también determina qué tan volátil se considera tu perfil de inversión para efectos del tope de cuota de mercado del 2027: un
            portafolio más volátil reduce cuántas pólizas puede sostener tu capital manteniendo un margen de solvencia saludable.
          </p>
        </SubSection>
      </Section>

      <Section n="4" title="Conceptos que debes aplicar">
        <p className="text-[15px] italic text-[var(--color-brand-text-secondary)]">
          Esto es una guía de razonamiento: el modelo exacto de riesgo y la asignación óptima del portafolio son parte de lo que se evalúa que tu
          equipo descubra.
        </p>

        <SubSection title="Para la tarifa" accent="act">
          <p>Antes de fijar precios, trabaja con dos preguntas clásicas de tarificación de seguros:</p>
          <ul className="list-disc pl-5">
            <li>
              <strong>¿Qué tan probable es que cada póliza tenga un siniestro, y qué tan costoso sería si lo tiene?</strong> El universo público te da 13
              variables de riesgo por póliza; los resultados de siniestralidad están en el dataset Chile (sección 3), que trae sus propios retos de
              transferibilidad hacia Colombia. Las variables pesan distinto entre sí — parte de tu trabajo es identificar cuáles llevan señal real de
              riesgo. Estimar el modelo de frecuencia/severidad con criterio actuarial (frecuencia esperada × severidad esperada ≈ costo esperado por
              póliza) es justamente lo que se evalúa.
            </li>
            <li>
              <strong>Precio y volumen están en tensión.</strong> El mercado tiene un tope de cuota por equipo, que limita cuánto volumen te compra
              bajar el precio — y cada punto de prima por encima del mercado te cuesta clientes. Piensa en tu tarifa como una curva de trade-offs entre
              volumen y margen.
            </li>
          </ul>

          <InfoNote>
            <p>
              <strong>Un chequeo de sensatez antes de enviar:</strong> como referencia de orden de magnitud, un promedio de tarifa entre aproximadamente{" "}
              <strong>$3.000.000 y $5.000.000 COP</strong> por póliza es un punto de partida razonable. Tómalo como referencia de orden de magnitud:
              cómo varías el precio entre pólizas de distinto riesgo importa tanto como el promedio.
            </p>
            <p className="mt-2">Un par de chequeos rápidos que te pueden dar señales tempranas:</p>
            <ul className="list-disc pl-5">
              <li>
                <strong>Revisa tu tarifa mínima y máxima.</strong> ¿Tienen sentido frente al perfil de riesgo de esas pólizas, o son un artefacto de tu
                fórmula?
              </li>
              <li>
                <strong>Compara tu media con tu mediana.</strong> Si la media queda bastante por encima de la mediana, ¿qué te dice eso sobre la forma
                de tu distribución de precios — y sobre qué tan bien tu tarifa distingue riesgo alto de riesgo bajo?
              </li>
            </ul>
          </InfoNote>
        </SubSection>

        <SubSection title="Para el portafolio de mínima varianza" accent="fin">
          <p>
            La matriz de covarianza es la pieza central de este ejercicio: la varianza de tu portafolio depende de cómo se mueven los instrumentos
            entre sí. Antes de asignar pesos, considera:
          </p>
          <ul className="list-disc pl-5">
            <li>
              <strong>El rendimiento objetivo obliga a combinar instrumentos.</strong> Si el instrumento más seguro del menú rinde por debajo del
              objetivo, alcanzarlo exige mezclarlo con otros — y cuál es la mejor mezcla depende de cómo covarían entre sí, más allá de sus
              volatilidades individuales.
            </li>
            <li>
              <strong>Correlación baja (o negativa) reduce riesgo.</strong> Dos instrumentos con volatilidades similares que se mueven de forma
              independiente pueden combinarse en un portafolio con menos riesgo total que cualquiera de los dos por separado — esa relación es
              exactamente lo que te muestra la matriz de covarianza.
            </li>
            <li>
              <strong>El rendimiento objetivo es una restricción fija; cómo lo alcanzas es tu decisión.</strong> Hay muchas combinaciones de pesos que llegan al mismo
              rendimiento esperado — tu trabajo es encontrar, de esas, la que minimiza la varianza resultante.
            </li>
            <li>
              <strong>TES3 y TES UVR 8 pagan cupón anual.</strong> Eso les da liquidez intermedia año a año, y por eso su exposición genuina al riesgo
              de tasa es algo menor de lo que su plazo nominal sugeriría por sí solo; la matriz de covarianza ya refleja esto.
            </li>
          </ul>
        </SubSection>

        <PreguntasAbiertas>
          <li>
            ¿Qué otras variables, si estuvieran disponibles, podrían mejorar tu estimación de frecuencia/severidad más allá de las 13 que tienes en el
            universo público?
          </li>
          <li>¿Qué pasa si cobras lo mismo a todos, o casi lo mismo?</li>
          <li>¿Qué consecuencias tiene ser el equipo con las tarifas más altas? ¿Y el equipo con las tarifas más bajas?</li>
          <li>¿Cómo cambiaría tu estrategia de precio si el mercado no tuviera un tope de cuota por equipo?</li>
          <li>Si el rendimiento objetivo de tu portafolio subiera considerablemente, ¿qué instrumentos esperarías que ganen peso, y por qué?</li>
        </PreguntasAbiertas>
      </Section>

      <Section n="5" title="Plantilla de mínima varianza — cómo se construye y cómo alimenta el resultado">
        <p>
          Esta sección te muestra la <strong>estructura</strong> exacta que va a evaluar el motor, vacía, para que puedas planear tus pesos en papel antes
          de enviarlos en el formulario (que además te muestra la matriz de covarianza completa en vivo). Las fórmulas de calificación que aparecen aquí
          son las mismas que vas a ver, ya resueltas con tus números, en los resultados objetivos después de guardar tu portafolio.
        </p>

        <FlowStep n="1" title="5.1 · Instrumentos disponibles">
          <InstrumentsTable />
          <p className="text-[15px] italic text-[var(--color-brand-text-secondary)]">
            Asume que los plazos (tanto vencimientos como cupones) se cuentan desde el momento en que compras el instrumento, independientemente del
            mes calendario.
          </p>
          <p>
            <strong>Matriz de covarianza</strong> entre los 6 instrumentos — la pieza que necesitas para calcular la varianza de cualquier combinación
            de pesos (ver sección 4).
          </p>
          <MatrixTable />
        </FlowStep>

        <FlowStep n="2" title="5.2 · Tus pesos — plantilla en blanco">
          <BlankTable
            headers={["Instrumento (del menú de 5.1)", "% asignado"]}
            rows={INSTRUMENTS.length}
            note="Un peso por instrumento, que debe sumar 100%. La matriz de covarianza completa (36 valores) está en la sección 5.1."
          />
          <FlagCallout>
            <span className="font-semibold">Restricción — </span>
            tus pesos deben alcanzar un <strong>rendimiento esperado mínimo</strong> (visible en el formulario). El sistema solo guarda envíos que lo
            cumplan, así que puedes usar los intentos rechazados como retroalimentación mientras ajustas tus pesos.
          </FlagCallout>
        </FlowStep>

        <FlowStep n="3" title="5.3 · La nota — plantilla de calificación">
          <div className="rounded border border-[var(--color-brand-gray-light)] bg-[var(--color-brand-blue-light)] p-3">
            <p className="text-xs uppercase text-[var(--color-brand-text-secondary)]">Nota del portafolio de mínima varianza</p>
            <p className="my-1 flex h-9 w-28 items-center justify-center rounded border border-dashed border-[var(--color-brand-gray-light)] font-[family-name:var(--font-condensed)] text-lg font-bold text-[var(--color-brand-text-secondary)]">
              &nbsp;
            </p>
            <p className="text-xs italic text-[var(--color-brand-text-secondary)]">
              Banda de tolerancia sobre el error relativo entre tu varianza lograda y la varianza mínima real: 100 dentro de la tolerancia perfecta,
              decae linealmente hasta 0 en la tolerancia cero (ambas configurables por el evaluador, mismas bandas que el resto de entregables numéricos).
            </p>
          </div>
        </FlowStep>

        <FlowStep n="4" title="5.4 · El camino completo, de tu decisión a tu nota" last>
          <div className="rounded border border-[var(--color-brand-gray-light)] p-3">
            <p className="text-sm">
              Tus pesos (5.2), sujetos a la restricción de retorno (5.3) → se comparan contra el portafolio de mínima varianza real al mismo retorno
              objetivo → la cercanía entre tu varianza lograda y esa varianza mínima real es tu nota de hoy.
            </p>
            <p className="mt-2 text-sm">
              Este portafolio se queda aquí como ejercicio aparte: tu decisión de inversión real la tomarás una vez conozcas tus cifras reales de prima
              y siniestros de este año.
            </p>
          </div>
        </FlowStep>
      </Section>
    </div>
  );
}
