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

/** Read-only reference table for a dataset's columns — unlike BlankTable, these rows are filled in (a data dictionary), not inputs to complete. */
function DataDictTable({ rows }: { rows: { col: string; desc: string; rango: string }[] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse border border-[var(--color-brand-gray-light)] text-xs">
        <thead>
          <tr>
            {["Columna", "Descripción", "Valores / rango"].map((h) => (
              <th key={h} className="border border-[var(--color-brand-gray-light)] bg-[var(--color-brand-blue-light)] px-2 py-1.5 text-left font-semibold text-[var(--color-brand-blue-accent)]">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.col}>
              <td className="border border-[var(--color-brand-gray-light)] px-2 py-1.5 font-mono">{r.col}</td>
              <td className="border border-[var(--color-brand-gray-light)] px-2 py-1.5">{r.desc}</td>
              <td className="border border-[var(--color-brand-gray-light)] px-2 py-1.5 text-[var(--color-brand-text-secondary)]">{r.rango}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** Two-column term/definition reference table — same read-only pattern as DataDictTable, different shape. */
function GlossaryTable({ rows }: { rows: { term: string; def: string }[] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse border border-[var(--color-brand-gray-light)] text-xs">
        <thead>
          <tr>
            {["Término", "Definición"].map((h) => (
              <th key={h} className="border border-[var(--color-brand-gray-light)] bg-[var(--color-brand-blue-light)] px-2 py-1.5 text-left font-semibold text-[var(--color-brand-blue-accent)]">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.term}>
              <td className="border border-[var(--color-brand-gray-light)] px-2 py-1.5 font-semibold">{r.term}</td>
              <td className="border border-[var(--color-brand-gray-light)] px-2 py-1.5">{r.def}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function GuiaPasanteDia1() {
  return (
    <div className="flex flex-col gap-5 text-[var(--color-foreground)]">
      <header className="rounded-lg border-t-8 border-t-[var(--color-brand-blue)] bg-[var(--color-brand-surface)] p-6">
        <p className="text-xs font-semibold uppercase tracking-wide text-[var(--color-brand-blue-accent)]">Pasantía Técnica · Seguros SURA</p>
        <h1 className="mt-1 font-[family-name:var(--font-condensed)] text-3xl font-bold text-[var(--color-brand-blue)]">Guía del pasante</h1>
        <p className="mt-1 font-[family-name:var(--font-condensed)] text-lg font-semibold text-[var(--color-brand-blue-accent)]">
          Día 1 — Tarificación Año 1 y portafolio de mínima varianza
        </p>
        <p className="mt-4 text-sm text-[var(--color-brand-text-secondary)]">
          Esta es tu herramienta principal para abordar el reto de hoy. Léela antes de subir tu tarifa o construir tu portafolio: te explica exactamente
          qué se va a calificar, con qué criterios, y qué conceptos debes tener en cuenta para tomar buenas decisiones — sin resolverte el ejercicio.
        </p>
      </header>

      <InsumosEntregables
        insumos={[
          "Universo público de 1.000.000 exposiciones (13 variables de riesgo, sin resultados) — pestaña Simulación.",
          "Dataset de referencia Chile (100.000 pólizas con siniestros reales) — misma pestaña.",
          "Matriz de covarianza de los 6 instrumentos financieros y el rendimiento esperado objetivo de tu portafolio — formulario del portafolio.",
        ]}
        entregables={["CSV de tarifa: id_expuesto, prima — una fila por cada exposición del universo.", "Portafolio de mínima varianza: un peso (%) por instrumento, que sume 100%."]}
      />

      <Section n="1" title="Contexto del día">
        <p>
          El reto simula 4 días de trabajo repartidos en 2 años de operación de una aseguradora de autos. Tu equipo compite contra los demás equipos del
          cohorte por una porción de un mercado sintético de 1.000.000 de pólizas de auto en Colombia — cada póliza tiene características de riesgo reales
          (edad del conductor, zona, tipo de vehículo, antigüedad, kilometraje, historial de siniestros, valor asegurado, uso, tipo de parqueadero, nivel
          educativo, estrato, género, marca).
        </p>
        <p>Hoy tomas dos decisiones independientes que definen el punto de partida de todo lo que sigue:</p>
        <ul className="list-disc pl-5">
          <li>
            <strong>Actuarial — la tarifa del Año 1.</strong> Fijas el precio de cada póliza. Al cerrar el día, todos los equipos entran a un mercado
            simultáneo: cada asegurado elige la aseguradora que más le conviene, y el resultado (cuántas pólizas ganaste, con qué nivel de riesgo) queda
            fijado para el resto del ejercicio — es la base de todo lo que vas a reportar el resto del ejercicio.
          </li>
          <li>
            <strong>Financiero — el portafolio de mínima varianza.</strong> Antes de escribir una sola póliza, presentas al regulador el portafolio de
            menor riesgo posible que aún alcance un rendimiento objetivo — una decisión aparte de cómo inviertas tu presupuesto real más adelante en el
            ejercicio. Este portafolio de mínima varianza también alimenta tu tope de cuota de mercado del Año 1 (ver sección 3).
          </li>
        </ul>
        <p>
          Además de estos dos entregables objetivos (auto-calificados contra el motor de referencia), el evaluador también observa cómo tu equipo trabaja
          — comunicación, reparto de roles, calidad del razonamiento — como parte de una calificación subjetiva separada. Esta guía se enfoca en lo
          objetivo, que es lo que tiene una fórmula exacta que puedes anticipar.
        </p>
      </Section>

      <Section n="2" title="Teoría necesaria">
        <p className="text-[13px] italic text-[var(--color-brand-text-secondary)]">
          El modelo exacto (qué variables usar, con qué forma funcional, con qué parámetros) no se revela ni se prescribe — es una decisión de tu
          equipo, y distintos enfoques razonables pueden llegar a tarifas distintas. Esta sección te da los datos y el marco conceptual sobre el que
          se construye cualquier estimación razonable, no la respuesta.
        </p>

        <SubSection title="Diccionario de datos — universo Colombia" accent="act">
          <p>Las 1.000.000 exposiciones del universo público llegan en un CSV con estas columnas (ninguna incluye resultados de siniestralidad):</p>
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
            100.000 pólizas con 3 años de siniestros reales (2021-2023) — a diferencia del universo Colombia, este sí trae resultados. Sus valores
            monetarios están en <strong>UF</strong> (Unidad de Fomento, la unidad chilena indexada a la inflación), no en pesos colombianos.
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
              { col: "fecha_aviso_2021 / _2022 / _2023", desc: "Fecha en que se avisó el siniestro a la aseguradora (vacío si no hubo)", rango: "AAAA-MM-DD" },
              { col: "monto_uf_2021 / _2022 / _2023", desc: "Monto del siniestro, en UF (vacío si no hubo)", rango: "> 0 UF" },
            ]}
          />
          <div className="rounded border border-[var(--color-brand-cyan-light)] bg-[var(--color-brand-cyan-light)] px-3 py-2">
            <p className="mb-1 text-xs font-semibold uppercase text-[var(--color-brand-blue-accent)]">El desafío de transferibilidad</p>
            <p className="text-xs text-[var(--color-brand-text-secondary)]">
              Este dataset está en UF y corresponde a 2021-2023 — varios años antes del Año 1 de este ejercicio (2027). Usarlo como
              referencia de severidad para tu propia tarifa exige resolver dos brechas distintas, no solo convertir unidades:
            </p>
            <ul className="mt-1 list-disc pl-5 text-xs text-[var(--color-brand-text-secondary)]">
              <li>
                <strong>Brecha temporal, dentro de Chile mismo.</strong> La UF ya está indexada a la inflación chilena — por diseño, su
                poder adquisitivo real se mantiene constante en el tiempo, así que no existe una &ldquo;inflación real de la UF&rdquo;
                que investigar ahí. Lo que sí cambia año a año es el costo real de reparar un vehículo (repuestos, mano de obra), medido
                en UF — compara la severidad promedio de 2021, 2022 y 2023 en el CSV para estimar esa tendencia, y proyéctala los años
                que faltan hasta 2027.
              </li>
              <li>
                <strong>Brecha de moneda, entre Chile y Colombia.</strong> Una vez tengas esa severidad proyectada a 2027 en UF, sigue en
                la unidad equivocada — te falta convertirla a pesos colombianos para que sea comparable con tu propio modelo de
                severidad. Esa tasa de conversión es información pública que puedes investigar, igual que un actuario real lo haría
                antes de usar un dataset de otro país como referencia.
              </li>
            </ul>
          </div>
        </SubSection>

        <SubSection title="De la prima pura a la prima comercial" accent="act">
          <p>
            La <strong>prima pura</strong> (o prima de riesgo) es el costo esperado puro de un riesgo — frecuencia esperada × severidad esperada —
            sin ningún cargo comercial todavía. La <strong>prima comercial</strong> es lo que efectivamente le cobras al cliente: la prima pura,
            cargada para cubrir los gastos de operar el negocio y dejar un margen de utilidad.
          </p>
          <div className="rounded border border-[var(--color-brand-blue-accent)] bg-[var(--color-brand-blue-light)] p-4 text-center">
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
          <p className="text-[13px] italic text-[var(--color-brand-text-secondary)]">
            Con estos valores, el denominador de la fórmula es 1 − 25% − 20% = 0.55. Esto carga tu prima pura de forma pareja para todo el libro —
            no resuelve cuánto debe pagar cada póliza individual frente a otra, que es lo que decide tu propio modelo de frecuencia/severidad, abajo.
          </p>
        </SubSection>

        <SubSection title="Frecuencia × severidad: el costo esperado de un riesgo" accent="act">
          <p>
            La forma clásica de tarificar un riesgo asegurable descompone su costo esperado en dos preguntas independientes: ¿qué tan probable es que
            ocurra un siniestro? (frecuencia) y, si ocurre, ¿cuánto cuesta? (severidad). El costo esperado — la prima pura — es el producto de las
            dos: <code className="rounded bg-black/5 px-1">E[costo] = E[frecuencia] × E[severidad]</code>, nunca un solo número agregado, porque
            frecuencia y severidad responden a mecanismos distintos y pueden moverse en direcciones opuestas (un conductor más joven puede tener mayor
            frecuencia de siniestro sin que eso diga nada sobre cuánto cuesta cada uno).
          </p>
          <p>
            Cómo pasar de esa idea general a un precio distinto por póliza — qué variables usar, con qué forma funcional, cómo combinarlas — es una
            decisión de modelamiento de tu equipo, no una receta que debas reproducir. No todas las variables del diccionario de datos de arriba
            necesariamente cargan señal real de riesgo — parte del trabajo actuarial es distinguir cuáles sí y cuáles son ruido, antes de dejarlas
            influir en tu estimación.
          </p>
        </SubSection>

        <SubSection title="Portafolio de mínima varianza (teoría de Markowitz)" accent="fin">
          <p>
            El marco de Markowitz parte de una idea poco intuitiva a primera vista: el riesgo (varianza) de un portafolio no es el promedio ponderado de
            la varianza de cada instrumento que lo compone — depende de cómo covarían entre sí. Combinar instrumentos con correlación baja, o negativa,
            puede reducir la varianza total del portafolio por debajo de la de cualquiera de sus componentes individuales, sin sacrificar rendimiento
            esperado — ese es, en esencia, el beneficio de diversificar.
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
        <SubSection title="Tarifa Año 1" accent="act">
          <p>
            Debes subir un CSV con dos columnas — <code className="rounded bg-black/5 px-1">id_expuesto,prima</code> — con una prima para cada una de las
            1.000.000 exposiciones del universo público (descargable desde la pestaña de Simulación de este día).
          </p>
          <p>
            <strong>No existe una &ldquo;tarifa correcta&rdquo; única que debas adivinar.</strong> Al cierre del día se corre un mercado de elección: cada
            asegurado compara el precio que le ofrece cada equipo y elige racionalmente (con algo de ruido aleatorio y cierta inercia hacia su aseguradora
            actual), sujeto a un tope de cuota de mercado por equipo — ningún equipo puede quedarse con todo el mercado solo por ser el más barato; el
            exceso de demanda se redistribuye entre los equipos que todavía tienen cupo disponible.
          </p>
          <p>
            Tu nota actuarial del día depende de tu resultado técnico (prima cobrada − siniestros − gastos de adquisición/comisión/administración),
            comparado contra un desempeño de referencia que define el propio modelo — no contra el resultado de los demás equipos. Precios muy altos pierden
            clientes (y con ellos, ingreso); precios muy bajos ganan volumen, pero pueden hundir el resultado técnico si atraen selectivamente el riesgo
            equivocado — y los gastos, al ser un porcentaje fijo de la prima, pesan más cuanto más barato cobres.
          </p>
          <ul className="list-disc pl-5">
            <li>Resultado técnico en cero (ni ganancia ni pérdida, ya descontados los gastos) → nota 50.</li>
            <li>Resultado técnico positivo → nota por encima de 50, acercándose a 100 mientras mejor sea tu margen.</li>
            <li>Resultado técnico negativo → nota por debajo de 50, acercándose a 0 mientras peor sea, sin llegar nunca a un número negativo.</li>
            <li>
              El &ldquo;buen desempeño&rdquo; de referencia (el que da una nota de 75) es un margen técnico neto del 20% sobre la prima, después de
              siniestros y gastos — calculado sobre tu propia siniestralidad real, no un monto fijo en pesos, para que un equipo con una cartera chica y uno
              con una grande se midan con la misma vara relativa.
            </li>
          </ul>
          <p className="text-[13px] italic text-[var(--color-brand-text-secondary)]">
            Si tu equipo no alcanza a completar su tarifa a tiempo, la pestaña de Simulación tiene una opción de emergencia — &ldquo;Tercerizar
            tarifas&rdquo; — que contrata a una consultora chilena, sin experiencia en el mercado colombiano, para definirla por ustedes. Les permite seguir
            participando en el mercado de ese día; el costo de esa consultoría corre por cuenta del equipo, y el detalle de la tarifa asignada solo se
            revela una vez se publiquen los resultados de ese día. Aplica igual en el Año 2.
          </p>
          <p className="text-[13px] italic text-[var(--color-brand-text-secondary)]">
            Para calibrar tu propio modelo de frecuencia y severidad tienes disponible, además del universo público, un dataset de referencia con
            siniestros reales (dataset Chile, 100.000 pólizas, descargable desde la pestaña de Simulación de este día) — juzgar qué variables aplican a
            Colombia y cómo ajustarlas es parte del reto.
          </p>
        </SubSection>

        <SubSection title="Portafolio de mínima varianza" accent="fin">
          <p>
            Asignas un peso (que debe sumar 100%) entre los instrumentos disponibles (tabla en la sección 5) buscando el <strong>menor riesgo posible</strong>{" "}
            — medido como la varianza del portafolio, usando la matriz de covarianza que se te da en el formulario — sujeto a alcanzar al menos un{" "}
            <strong>rendimiento esperado objetivo</strong>. No es un árbol de decisiones con vencimientos y reinversión: es una asignación de pesos, de
            una sola vez, sin reinversión ni horizonte temporal — una fotografía de cómo invertirías el capital hoy mismo, antes de saber cuánta prima vas
            a cobrar o cuántos siniestros vas a pagar.
          </p>
          <p>
            Tu nota compara la varianza que realmente lograste contra la varianza mínima real (la que un portafolio óptimo habría logrado con el mismo
            rendimiento objetivo) — mientras más cerca de esa varianza mínima, mejor tu nota.
          </p>
          <p className="text-[13px] italic text-[var(--color-brand-text-secondary)]">
            Este portafolio también determina qué tan volátil se considera tu perfil de inversión para efectos del tope de cuota de mercado del Año 1: un
            portafolio más volátil reduce cuántas pólizas puede sostener tu capital manteniendo un margen de solvencia saludable.
          </p>
        </SubSection>
      </Section>

      <Section n="4" title="Conceptos que debes aplicar">
        <p className="text-[13px] italic text-[var(--color-brand-text-secondary)]">
          Esto es una guía de razonamiento, no una receta — el modelo exacto de riesgo y la asignación óptima del portafolio son parte de lo que se
          evalúa que tu equipo descubra.
        </p>

        <SubSection title="Para la tarifa" accent="act">
          <p>Antes de fijar precios, trabaja con dos preguntas clásicas de tarificación de seguros:</p>
          <ul className="list-disc pl-5">
            <li>
              <strong>¿Qué tan probable es que cada póliza tenga un siniestro, y qué tan costoso sería si lo tiene?</strong> El universo público te da 13
              variables de riesgo por póliza, pero sin resultados — para eso está el dataset Chile (sección 3), que trae sus propios retos de
              transferibilidad hacia Colombia. No todas las variables pesan igual — parte de tu trabajo es identificar cuáles combinan señal real de
              riesgo y cuáles no. El modelo exacto de frecuencia/severidad no se revela: se espera que lo estimes con criterio actuarial (frecuencia
              esperada × severidad esperada ≈ costo esperado por póliza), no que lo adivines a ciegas.
            </li>
            <li>
              <strong>¿Qué pasa si cobras lo mismo a todos, o casi lo mismo?</strong> Una tarifa plana es vulnerable a selección adversa: los clientes de
              menor riesgo encuentran mejores precios en otro equipo y se van, mientras te quedas desproporcionadamente con los de mayor riesgo — tu prima
              promedio deja de cubrir tu costo promedio real.
            </li>
            <li>
              <strong>Precio y volumen están en tensión, no son independientes.</strong> El mercado tiene un tope de cuota por equipo, así que no puedes
              ganar simplemente bajando el precio sin límite — y cada punto de prima por encima del mercado te cuesta clientes. Piensa en tu tarifa como
              una curva de trade-offs entre volumen y margen, no como un solo número a optimizar en el vacío.
            </li>
          </ul>
        </SubSection>

        <SubSection title="Para el portafolio de mínima varianza" accent="fin">
          <p>
            La matriz de covarianza no es un adorno — es la pieza que hace que este ejercicio no se resuelva solo mirando la volatilidad individual de
            cada instrumento. Antes de asignar pesos, considera:
          </p>
          <ul className="list-disc pl-5">
            <li>
              <strong>El instrumento menos volátil solo no basta.</strong> Con un rendimiento objetivo por cumplir, no puedes simplemente concentrar todo
              en el instrumento más seguro del menú si su rendimiento no alcanza el objetivo — necesitas combinar instrumentos, y la combinación óptima
              depende de cómo covarían entre sí, no solo de sus volatilidades individuales.
            </li>
            <li>
              <strong>Correlación baja (o negativa) reduce riesgo más que un instrumento &ldquo;seguro&rdquo; aislado.</strong> Dos instrumentos con
              volatilidades similares pero que no se mueven juntos pueden combinarse en un portafolio con menos riesgo total que cualquiera de los dos por
              separado — ese es exactamente el tipo de relación que la matriz de covarianza te muestra y una tabla de volatilidades individuales no.
            </li>
            <li>
              <strong>El rendimiento objetivo no es negociable, pero cómo lo alcanzas sí.</strong> Hay muchas combinaciones de pesos que llegan al mismo
              rendimiento esperado — tu trabajo es encontrar, de esas, la que minimiza la varianza resultante.
            </li>
          </ul>
        </SubSection>

        <PreguntasAbiertas>
          <li>
            ¿Qué otras variables, si estuvieran disponibles, podrían mejorar tu estimación de frecuencia/severidad más allá de las 13 que tienes en el
            universo público?
          </li>
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

        <FlowStep n="2" title="5.2 · Tus pesos — plantilla en blanco">
          <BlankTable
            headers={["Instrumento (del menú de 5.1)", "% asignado"]}
            rows={INSTRUMENTS.length}
            note="Aquí no hay vencimientos ni reinversión — solo un peso por instrumento, que debe sumar 100%. La matriz de covarianza completa (36 valores) se te muestra en vivo en el formulario y también es descargable en CSV desde la pestaña de instrumentos — no se repite aquí por ser demasiado extensa para una plantilla en papel."
          />
          <div className="rounded border border-[var(--color-brand-cyan-light)] bg-[var(--color-brand-cyan-light)] px-3 py-2">
            <p className="text-xs text-[var(--color-brand-text-secondary)]">
              <span className="font-semibold text-[var(--color-brand-blue-accent)]">Restricción — </span>
              tus pesos deben alcanzar un <strong>rendimiento esperado mínimo</strong> (visible en el formulario). El sistema rechaza cualquier envío que
              no lo alcance — no vas a poder guardar un portafolio que no cumpla la restricción, así que puedes usar los intentos rechazados como
              retroalimentación mientras ajustas tus pesos.
            </p>
          </div>
        </FlowStep>

        <FlowStep n="3" title="5.3 · La nota — plantilla de calificación">
          <div className="rounded border border-[var(--color-brand-blue-accent)] bg-[var(--color-brand-blue-light)] p-3">
            <p className="text-xs uppercase text-[var(--color-brand-text-secondary)]">Nota del portafolio de mínima varianza</p>
            <p className="my-1 flex h-9 w-28 items-center justify-center rounded border border-dashed border-[var(--color-brand-blue-accent)] font-[family-name:var(--font-condensed)] text-lg font-bold text-[var(--color-brand-text-secondary)]">
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
              Este portafolio no se vuelve a usar más adelante en el ejercicio — es un ejercicio aparte de tu decisión de inversión real, que tomarás
              una vez conozcas tus cifras reales de prima y siniestros de este año.
            </p>
          </div>
        </FlowStep>
      </Section>
    </div>
  );
}
