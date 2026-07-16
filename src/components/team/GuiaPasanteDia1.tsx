import { INSTRUMENTS, displayYieldLabel } from "@/domain/finance/instruments";

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
            fijado para el resto del ejercicio — es la base del estado de resultados que vas a reportar desde el Día 2 y de las reservas técnicas que vas
            a calcular como parte del Balance en el Día 3.
          </li>
          <li>
            <strong>Financiero — el portafolio de mínima varianza.</strong> Antes de escribir una sola póliza, presentas al regulador el portafolio de
            menor riesgo posible que aún alcance un rendimiento objetivo — una decisión aparte del árbol de inversión real, que vas a construir en el
            Día 2 una vez conozcas tus cifras reales de prima y siniestros. Este portafolio de mínima varianza también alimenta tu tope de cuota de
            mercado del Año 1 (ver sección 2).
          </li>
        </ul>
        <p>
          Además de estos dos entregables objetivos (auto-calificados contra el motor de referencia), el evaluador también observa cómo tu equipo trabaja
          — comunicación, reparto de roles, calidad del razonamiento — como parte de una calificación subjetiva separada. Esta guía se enfoca en lo
          objetivo, que es lo que tiene una fórmula exacta que puedes anticipar.
        </p>
      </Section>

      <Section n="2" title="Qué se te va a calificar">
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
            Asignas un peso (que debe sumar 100%) entre los instrumentos disponibles (tabla en la sección 4) buscando el <strong>menor riesgo posible</strong>{" "}
            — medido como la varianza del portafolio, usando la matriz de covarianza que se te da en el formulario — sujeto a alcanzar al menos un{" "}
            <strong>rendimiento esperado objetivo</strong>. No es un árbol de decisiones de vencimientos como el del Día 2: es una asignación de pesos, de
            una sola vez, sin reinversión ni horizonte temporal — una fotografía de cómo invertirías el capital hoy mismo, antes de saber cuánta prima vas
            a cobrar o cuántos siniestros vas a pagar.
          </p>
          <p>
            Tu nota compara la varianza que realmente lograste contra la varianza mínima real (la que un portafolio óptimo habría logrado con el mismo
            rendimiento objetivo) — mientras más cerca de esa varianza mínima, mejor tu nota.
          </p>
          <p className="text-[13px] italic text-[var(--color-brand-text-secondary)]">
            Este portafolio también determina qué tan volátil se considera tu perfil de inversión para efectos del tope de cuota de mercado del Año 1: un
            portafolio más volátil reduce cuántas pólizas puede sostener tu capital manteniendo un margen de solvencia saludable (el mismo mecanismo que
            vas a ver en detalle en el Día 4).
          </p>
        </SubSection>
      </Section>

      <Section n="3" title="Conceptos que debes aplicar">
        <p className="text-[13px] italic text-[var(--color-brand-text-secondary)]">
          Esto es una guía de razonamiento, no una receta — el modelo exacto de riesgo y la asignación óptima del portafolio son parte de lo que se
          evalúa que tu equipo descubra.
        </p>

        <SubSection title="Para la tarifa" accent="act">
          <p>Antes de fijar precios, trabaja con dos preguntas clásicas de tarificación de seguros:</p>
          <ul className="list-disc pl-5">
            <li>
              <strong>¿Qué tan probable es que cada póliza tenga un siniestro, y qué tan costoso sería si lo tiene?</strong> El universo público te da 13
              variables de riesgo por póliza, pero sin resultados — para eso está el dataset Chile (sección 2), que trae sus propios retos de
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
      </Section>

      <Section n="4" title="Plantilla de mínima varianza — cómo se construye y cómo alimenta el resultado">
        <p>
          Esta sección te muestra la <strong>estructura</strong> exacta que va a evaluar el motor, vacía, para que puedas planear tus pesos en papel antes
          de enviarlos en el formulario (que además te muestra la matriz de covarianza completa en vivo). Las fórmulas de calificación que aparecen aquí
          son las mismas que vas a ver, ya resueltas con tus números, en los resultados objetivos después de guardar tu portafolio.
        </p>

        <div>
          <p className="mb-1 text-xs font-semibold uppercase text-[var(--color-brand-text-secondary)]">4.1 · Instrumentos disponibles</p>
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
        </div>

        <div>
          <p className="mb-1 text-xs font-semibold uppercase text-[var(--color-brand-text-secondary)]">4.2 · Tus pesos — plantilla en blanco</p>
          <BlankTable
            headers={["Instrumento (del menú de 4.1)", "% asignado"]}
            rows={INSTRUMENTS.length}
            note="A diferencia del árbol de Día 2, aquí no hay vencimientos ni reinversión — solo un peso por instrumento, que debe sumar 100%. La matriz de covarianza completa (36 valores) se te muestra en vivo en el formulario y también es descargable en CSV desde la pestaña de instrumentos — no se repite aquí por ser demasiado extensa para una plantilla en papel."
          />
        </div>

        <div className="rounded border border-[var(--color-brand-cyan-light)] bg-[var(--color-brand-cyan-light)] px-3 py-2">
          <p className="text-xs text-[var(--color-brand-text-secondary)]">
            <span className="font-semibold text-[var(--color-brand-blue-accent)]">Restricción — </span>
            tus pesos deben alcanzar un <strong>rendimiento esperado mínimo</strong> (visible en el formulario). El sistema rechaza cualquier envío que no
            lo alcance — no vas a poder guardar un portafolio que no cumpla la restricción, así que puedes usar los intentos rechazados como
            retroalimentación mientras ajustas tus pesos.
          </p>
        </div>

        <div>
          <p className="mb-1 text-xs font-semibold uppercase text-[var(--color-brand-text-secondary)]">4.3 · La nota — plantilla de calificación</p>
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
        </div>

        <div className="rounded border border-[var(--color-brand-gray-light)] p-3">
          <p className="mb-1 text-xs font-semibold uppercase text-[var(--color-brand-text-secondary)]">4.4 · El camino completo, de tu decisión a tu nota</p>
          <p className="text-sm">
            Tus pesos (4.2), sujetos a la restricción de retorno (4.3) → se comparan contra el portafolio de mínima varianza real al mismo retorno
            objetivo → la cercanía entre tu varianza lograda y esa varianza mínima real es tu nota de hoy.
          </p>
          <p className="mt-2 text-sm">
            Este portafolio no se vuelve a usar en el P&G ni en el Balance — es un ejercicio aparte del árbol de inversión real, que vas a construir en el
            Día 2 una vez conozcas tus cifras reales de prima y siniestros de este año.
          </p>
        </div>
      </Section>
    </div>
  );
}
