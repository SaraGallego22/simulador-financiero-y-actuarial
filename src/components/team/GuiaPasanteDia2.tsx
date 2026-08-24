import {
  BlankTable,
  FlagCallout,
  FlowStep,
  FormulaNotes,
  GuiaHeader,
  InfoNote,
  InsumosEntregables,
  InstrumentsTable,
  MatrixTable,
  PreguntasAbiertas,
  Section,
  SubSection,
  tableClass,
  tableWrapClass,
  thClass,
  tdClass,
} from "./GuiaShared";

/** Vertical financial-statement template with real row labels, matching how DeliverablesForm groups/renders these same lines. */
function StatementTemplate({ rowLabels, emphasizedLabels, formulaNotes }: { rowLabels: string[]; emphasizedLabels?: string[]; formulaNotes?: string[] }) {
  return (
    <div className="flex flex-col gap-3">
      <div className={`${tableWrapClass} overflow-x-auto`}>
        <table className={tableClass}>
          <thead>
            <tr>
              <th className={thClass}>Línea</th>
              <th className={thClass}>2027</th>
            </tr>
          </thead>
          <tbody>
            {rowLabels.map((label) => (
              <tr key={label}>
                <td className={`${tdClass} ${emphasizedLabels?.includes(label) ? "font-semibold" : ""}`}>{label}</td>
                <td className={`h-8 ${tdClass}`}>&nbsp;</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {formulaNotes && <FormulaNotes lines={formulaNotes} />}
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
    <div className={`flex flex-col gap-2 ${tableWrapClass} p-3`}>
      <p className="text-xs text-[var(--color-brand-text-secondary)]">
        {label} <span className="font-semibold">({weight})</span>
      </p>
      <p className="flex h-9 items-center rounded-full border-2 border-dashed border-[var(--color-brand-gray-light)] px-3 font-[family-name:var(--font-condensed)] text-lg font-bold text-[var(--color-brand-text-secondary)]">
        &nbsp;
      </p>
      <p className="text-xs leading-relaxed text-[var(--color-brand-text-secondary)]">{formula}</p>
    </div>
  );
}

export function GuiaPasanteDia2() {
  return (
    <div className="flex flex-col gap-8 text-[var(--color-foreground)]">
      <GuiaHeader
        dia={2}
        subtitulo="P&G 2027, retarifación 2028 y portafolio real"
        intro="Esta es tu herramienta principal para abordar el reto de hoy. Léela antes de construir tu calendario de inversión: te explica exactamente qué se va a calificar, con qué criterios, y qué conceptos debes tener en cuenta para tomar buenas decisiones."
      />

      <InsumosEntregables
        insumos={[
          "Resultado real del mercado del 2027: pólizas ganadas y prima cobrada de tu propia cartera.",
          "Historial de siniestros por póliza avisados hasta la fecha — insumo para la retarifación de 2028 y para estimar tu Costo de Siniestros A1.",
          "Menú de 6 instrumentos financieros y su matriz de covarianza, para tu calendario de portafolio real.",
        ]}
        entregables={[
          "Tarifa 2028 (mismo formato CSV que Día 1: id_expuesto, prima).",
          "Asignación inicial de tu Capital Social (instrumento, % asignado) — separada del calendario, pero se invierte con él desde el mes 0.",
          "Calendario mensual de decisión de portafolio real (instrumento, % asignado, desde qué mes aplica).",
          "Estado de resultados completo del 2027 (13 líneas).",
        ]}
      />

      <Section n="1" title="Contexto del día">
        <p>
          Ya conoces el resultado real del 2027 — cuántas pólizas ganaste, con qué siniestralidad, y cuánta prima realmente cobraste. Hoy defines el
          calendario de decisión de tu portafolio de inversión real, ahora con esas cifras reales en la mano en vez de la incertidumbre del Día 1.
        </p>
        <ul className="list-disc pl-5">
          <li>
            <strong>Actuarial — retarifación 2028 y costo de siniestros 2027.</strong> Ajustas tu modelo de tarificación para el 2028, ahora con el
            historial de siniestros avisados de cada póliza como variable adicional. También estimas el costo de siniestros del 2027 para tu P&G:
            parte de esos siniestros sigue sin avisarse, así que es una estimación (ver sección 2). Las reservas técnicas del 2027 se calculan y
            reportan más adelante en el ejercicio.
          </li>
          <li>
            <strong>Financiero — el calendario de portafolio real.</strong> Defines, mes a mes, cómo invertir el excedente disponible ese mes (tabla de
            instrumentos en la sección 5): la asignación que definas para un mes se mantiene fija hasta que definas un cambio en un mes posterior. Esta
            decisión se pone a prueba mes a mes, durante 108 meses simulados, y alimenta directamente tu nota de ALM de hoy y, más adelante, el Resultado
            de Inversiones, el Balance y la Solvencia que vas a reportar en los días siguientes. A diferencia del portafolio de mínima varianza de Día 1
            (un ejercicio aparte, ya calificado), este calendario es tu decisión de inversión real.
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
        <p className="text-[15px] italic text-[var(--color-brand-text-secondary)]">
          El ajuste exacto de tu tarifa y la asignación óptima de tu calendario los define tu equipo — esta sección explica el marco conceptual con el
          que se construyen.
        </p>

        <SubSection title="Retarifar con un año de experiencia real" accent="act">
          <p>
            Ahora tienes un año de experiencia real por póliza: los siniestros ya avisados, con su magnitud. Sigue siendo una foto parcial, pero es
            información real con la que antes no contabas. Hay más de un camino razonable para aprovecharla:
          </p>
          <ul className="list-disc pl-5">
            <li>
              <strong>Revisar y corregir tu propio modelo de tarifa.</strong> Compara tu frecuencia/severidad estimada contra lo que realmente ocurrió
              — si alguna variable predijo mal, o si tu tarifa quedó sistemáticamente alta o baja frente a la siniestralidad real, este es el
              momento de mejorar esa misma estimación con evidencia real, incluso conservando el mismo método.
            </li>
            <li>
              <strong>Incorporar la experiencia individual de cada póliza, además de la de su clase de riesgo.</strong> Aquí es donde entra la teoría de
              credibilidad: formaliza cómo mezclar la experiencia propia de un asegurado con el promedio de su clase — la prima ajustada es un
              promedio ponderado entre las dos, donde el peso de la experiencia propia (el &ldquo;factor de credibilidad&rdquo;, entre 0 y 1) crece
              cuanto mayor sea el volumen de experiencia acumulada y menor su varianza frente a la varianza entre clases. Es un camino más
              sofisticado: un solo año de historial por póliza es poca información, y cuánta credibilidad le asignes es una decisión de criterio.
            </li>
          </ul>
          <p>
            Cualquiera de los dos caminos (o una combinación de ambos) es una respuesta legítima — lo que se evalúa es que tu retarifación use la
            información real que ya tienes.
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
            estimar ese número al ajustar tu severidad para la tarifa de este año es parte de lo que se evalúa.
          </p>
        </SubSection>

        <SubSection title="Estimar el costo de siniestros de 2027: Expected Loss Ratio" accent="act">
          <p>
            Ahora que el 2027 ya pasó, tu cartera empieza a mostrar siniestros reales, pero — igual que en cualquier aseguradora — todavía no
            conoces con certeza cuánto te van a costar en total. La cifra que persigues es la siniestralidad <strong>última</strong>: el costo
            final de los siniestros del año, una vez que todos estén completamente resueltos. Hasta que eso ocurra, dos reservas cubren la
            distancia entre lo que ya sabes y esa cifra final:
          </p>
          <ul className="list-disc pl-5">
            <li>
              <strong>Reserva de siniestros avisados (o reserva de aviso).</strong> Cubre los siniestros que ya se reportaron, pero cuyo costo
              final todavía puede seguir ajustándose — el siniestro es un hecho conocido; su valor exacto sigue en revisión.
            </li>
            <li>
              <strong>Reserva IBNR (Incurred But Not Reported).</strong> Cubre los siniestros que ya ocurrieron dentro del año y que la
              aseguradora todavía desconoce, porque siguen pendientes de aviso.
            </li>
          </ul>
          <p>
            En este ejercicio, el monto de un siniestro ya avisado se conoce con certeza — tu trabajo se concentra en estimar la reserva IBNR, y el
            Costo de Siniestros que reportas en tu P&amp;G (sección 3) debe reflejar esa siniestralidad última: lo que ya pagaste, más lo avisado que
            sigue pendiente de pago, más ese IBNR.
          </p>
          <p>
            Con un solo año de experiencia propia, apoyarte solo en tus siniestros avisados todavía es delicado: hay poca información, y esa poca
            puede ser poco representativa. Una forma de manejar esa incertidumbre es el método <strong>Expected Loss Ratio (ELR)</strong>: parte de
            un loss ratio (siniestros sobre prima) asumido y lo aplica sobre tu prima devengada para llegar a un costo último.
          </p>
          <div className="rounded border border-[var(--color-brand-gray-light)] bg-[var(--color-brand-blue-light)] p-4 text-center">
            <p className="font-[family-name:var(--font-condensed)] text-base font-bold text-[var(--color-brand-blue-accent)] sm:text-lg">
              Costo Último = Loss Ratio Esperado × Prima Devengada
            </p>
          </div>
          <p>
            <strong>¿De dónde sale ese loss ratio asumido?</strong> Es una decisión de tu equipo, y distintas referencias razonables te van a dar
            números distintos. Algunas que puedes considerar:
          </p>
          <ul className="list-disc pl-5">
            <li>
              <strong>El que implícitamente asumiste al fijar tu prima comercial en Día 1.</strong> Si usaste la fórmula de referencia sin ajustes
              (Prima Comercial = Prima Pura ÷ (1 − 25% gastos − 20% margen)), esa aritmética asume un loss ratio del 55% — ese es el supuesto de la
              fórmula, y el riesgo real de tu cartera pudo producir otro.
            </li>
            <li>
              <strong>La brecha entre tu severidad estimada y la real, en los casos que ya se avisaron.</strong> Para las pólizas de tu propia
              cartera con un siniestro avisado en 2027, ya puedes comparar la severidad que asumiste al tarificar contra la severidad real de ese
              siniestro — si tu estimación quedó sistemáticamente por debajo (o por encima), tienes una señal concreta de hacia dónde ajustar tu
              loss ratio asumido. Es una señal sobre severidad; la frecuencia de lo que sigue pendiente de aviso queda por fuera.
            </li>
            <li>
              <strong>El loss ratio real de todo el mercado del 2027</strong> — siniestros reales sobre prima devengada real, sumados entre los
              equipos del cohorte (nunca por equipo individual) — visible arriba, en la página de este día. Es lo que el mercado realmente produjo,
              pero mezcla carteras con tarifas distintas a la tuya.
            </li>
            <li>
              <strong>Un benchmark público del sector</strong> (loss ratios típicos de auto en Colombia) — una tercera referencia, externa a este
              mercado sintético y a tu propia cartera.
            </li>
          </ul>
          <InfoNote>
            <p>
              <strong>Cualquiera que elijas, tus propios siniestros avisados le ponen un piso.</strong> El costo último de un año no puede quedar por
              debajo de lo que ya sabes que ocurrió: es lo avisado más un IBNR que nunca es negativo. Así que el cociente entre tus siniestros avisados
              del 2027 y tu prima devengada es el mínimo que puede tomar tu loss ratio asumido — si la referencia que escogiste queda por debajo de ese
              número, ya sabes que está mal, y el verdadero está estrictamente por encima porque todavía falta lo que no se ha avisado.
            </p>
          </InfoNote>
          <p>
            Cada una de estas referencias tiene su propio punto ciego, y combinarlas o elegir entre ellas es parte de lo que se evalúa. El ELR tiene
            una ventaja clara en este punto del ejercicio — funciona con un solo año de experiencia propia, cuando esa experiencia todavía es poco
            creíble por sí sola — y una limitación igual de clara: tu costo último termina siendo tan bueno (o tan malo) como el loss ratio que
            decidas asumir, y con la información que tienes hoy verificarlo directamente queda fuera de tu alcance.
          </p>
        </SubSection>

        <SubSection title="P&G de una aseguradora" accent="fin">
          <p>
            El estado de resultados de una aseguradora se parece al de cualquier empresa, pero con ajustes que reflejan cómo funciona el negocio de
            seguros: la prima se &ldquo;gana&rdquo; a medida que transcurre la cobertura (una póliza a 12 meses todavía debe cubrir riesgo en los meses
            que faltan del año, así que una parte se aparta como Reserva de Prima No Devengada — un pasivo mientras esa cobertura siga pendiente), y el
            resultado se separa en capas: el Resultado Técnico es el equivalente a la utilidad bruta, con los ingresos y costos propios de la operación
            de asegurar, mientras que el Resultado Industrial es el equivalente a la utilidad operativa. Sumando el Resultado de Inversiones se llega a
            la Utilidad Neta. Esa separación por capas permite diagnosticar si un mal resultado viene de suscribir mal el riesgo, de gastos
            administrativos altos, o de un mal año de inversiones — tres causas con remedios distintos.
          </p>
        </SubSection>

        <SubSection title="Gestión ALM: calce de activos y pasivos" accent="fin">
          <p>
            Una aseguradora recibe efectivo por adelantado (la prima) y paga obligaciones inciertas en el tiempo (los siniestros) — el rol de la gestión
            ALM (Asset-Liability Management) es invertir ese efectivo de forma que esté disponible cuando esas obligaciones vencen, conservando todo el
            rendimiento que esa disponibilidad permita. La tensión central es de plazo: los instrumentos de mayor plazo suelen rendir más, pero
            inmovilizan el capital — si los siniestros llegan antes de que esa inversión venza, hay que vender antes de tiempo (con penalización) o,
            en el peor caso, recurrir a capital propio para cubrir el faltante. Un portafolio bien calzado balancea rendimiento con la certeza de tener
            caja disponible cuando se necesita.
          </p>
        </SubSection>
      </Section>

      <Section n="3" title="Qué se te va a calificar">
        <SubSection title="Estado de resultados 2027" accent="fin">
          <p>
            Reporta las 13 líneas del P&G del 2027, una por una. El motor ya conoce tu prima real (lo que efectivamente cobraste en el mercado,
            después del racionamiento por capital/solvencia si aplicó). Tu costo de siniestros, en cambio, es una estimación: solo ves los siniestros
            del 2027 ya avisados, así que tu Costo de Siniestros A1 es tu propia estimación del costo{" "}
            <strong>último</strong>, vía el método Expected Loss Ratio (sección 2). Los gastos de adquisición y comisión son los mismos porcentajes
            fijos sobre la prima <strong>emitida</strong> que ya usaste para calcular tu prima comercial en Día 1; el administrativo también. De tu
            prima emitida reservas un 20% como Reserva de Prima No Devengada (RPND), la parte que todavía cubre riesgo futuro; el 80% restante entra al
            Resultado Técnico como ingreso devengado. El Resultado de inversiones es el ingreso real que tu calendario de portafolio (abajo) devengó
            durante los 12 meses del 2027, mes a mes en la simulación.
          </p>
          <p>
            Las líneas se califican de dos formas distintas. Las que son puramente una fórmula de otras líneas que ya reportaste (RPND constituida,
            prima devengada, gastos, Resultado Técnico, Resultado Industrial, utilidad antes de impuestos, impuesto, utilidad neta) se califican contra
            lo que <strong>tú mismo</strong> reportaste en esas otras líneas: un solo error (por ejemplo, en tu costo de siniestros) te cuesta puntos
            una sola vez, siempre que hayas aplicado la fórmula correctamente sobre tu propio número. Prima emitida, costo de siniestros y resultado de
            inversiones se califican contra la cifra real del motor, con una banda de tolerancia sobre el error relativo: tu costo de siniestros en
            particular es una estimación genuina (ver sección 2).
          </p>

          <InfoNote>
            <p>
              <strong>Si tercerizaste tus tarifas, tu gasto de adquisición sube.</strong> Los honorarios de la consultora son el{" "}
              <strong>8% de tu prima emitida</strong> de ese año, y entran en esa misma línea: tarificar es parte del costo de colocar el negocio. Tu
              gasto de adquisición pasa entonces del <strong>4% al 12%</strong> de la prima emitida, y tus gastos totales del 25% al 33%.
            </p>
            <p className="mt-2">
              Como la línea está dentro del Resultado Técnico, esos honorarios te bajan el resultado técnico del año — y con él la utilidad, el
              patrimonio con que cierras y tu nota de tarificación, que se calcula sobre ese mismo resultado. Esa plata además sale de tu caja mes a mes,
              así que también reduce lo que te queda disponible para invertir en tu portafolio.
            </p>
          </InfoNote>
        </SubSection>
        <SubSection title="Calendario de portafolio real (ALM)" accent="fin">
          <p>
            Antes del calendario, tomas una decisión aparte: cómo repartir tu Capital Social entre los instrumentos del menú, desde el mes 0. Una vez
            invertido, un peso de Capital Social se comporta igual que un peso de prima: se mezcla en el mismo portafolio y sigue exactamente el mismo
            calendario que defines a continuación, incluyendo sus propios vencimientos y reinversiones. Lo único propio es su punto de partida.
          </p>
          <p>
            Luego construyes el calendario de decisiones de inversión: para cada mes en que quieras cambiar de estrategia, repartes el excedente
            disponible ese mes entre los instrumentos del menú (tabla en la sección 5). Esa asignación queda vigente desde ese mes en adelante —
            incluyendo cualquier vencimiento que vaya llegando — hasta que definas un cambio en un mes posterior: todo lo que vence entra a la misma
            bolsa de excedente disponible del mes en que vence, y se reinvierte con esa misma asignación. El sistema simula, mes a mes durante 60
            meses, cómo tu calendario enfrenta el flujo de caja real: primas que entran, siniestros y gastos que salen, vencimientos que regresan como
            caja, y lo que queda se reinvierte según el checkpoint vigente ese mes. TES3 y TES UVR 8 además pagan un cupón en efectivo cada 12 meses
            mientras la posición sigue abierta — ese cupón también entra como caja disponible ese mes, exactamente igual que un vencimiento.
          </p>
          <p>
            Este es tu único calendario para toda la simulación: el mismo que sometes hoy es el que sigue invirtiendo la prima real del 2028 más
            adelante. Ármalo pensando en los dos años a la vez; puedes agregar tantos cambios de estrategia como quieras a lo largo de los 108 meses
            simulados. Los 12 meses de prima del 2028 se invierten con el mismo calendario, leído otra vez desde su propio mes 0 — el checkpoint que
            uses para tu mes 3 de 2027 es el mismo que va a gobernar tu mes 3 de 2028, aunque hayas agregado después un cambio de estrategia en un mes
            más adelante en el calendario (ese cambio sigue rigiendo cómo se reinvierten las posiciones que ya llevas abiertas desde 2027; el conteo de
            la prima nueva de 2028 arranca de todos modos en su propio mes 0).
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
            La sección 5 te da la plantilla exacta y las fórmulas de cada componente, para que puedas anticipar tu nota antes de enviar tu calendario.
          </p>
        </SubSection>
      </Section>

      <Section n="4" title="Conceptos que debes aplicar">
        <p className="text-[15px] italic text-[var(--color-brand-text-secondary)]">
          Esto es una guía de razonamiento: la asignación óptima del portafolio es parte de lo que se evalúa que tu equipo descubra.
        </p>

        <SubSection title="Para estimar el costo de siniestros (ELR)" accent="act">
          <ul className="list-disc pl-5">
            <li>
              <strong>Tu siniestralidad avisada es un piso.</strong> Es información real y útil para contrastar tu ELR; tomarla como el costo final
              deja por fuera el IBNR pendiente y subestima sistemáticamente tu costo verdadero.
            </li>
            <li>
              <strong>Ya tienes una primera señal en tus propios siniestros avisados — úsala para calibrar tu ELR.</strong> En las pólizas de tu
              cartera con un siniestro avisado, compara la severidad que asumiste al tarificar contra la severidad real de ese siniestro; una brecha
              sistemática es una pista de hacia dónde ajustar la severidad que ya conoces.
            </li>
            <li>
              <strong>Cada equipo tiene su propio número, y puede alejarse del 55% de la fórmula de referencia.</strong> Ese 55% es el supuesto
              teórico de la fórmula; el riesgo real de tu cartera pudo producir otro. El loss ratio real de todo el mercado (página de este día,
              sección 2) es otra referencia útil para contrastar, aunque mezcla carteras con tarifas distintas a la tuya. Si tu propio ELR queda muy
              alejado de todas tus referencias disponibles, vale la pena revisar si tu modelo de frecuencia/severidad está capturando el riesgo real
              de tu cartera.
            </li>
            <li>
              <strong>Usa la Prima Devengada.</strong> El costo último se relaciona con la prima que efectivamente cubrió riesgo durante el año; la
              parte que sigue reservada como RPND queda por fuera (ver sección 3).
            </li>
          </ul>
        </SubSection>

        <SubSection title="Para el portafolio" accent="fin">
          <p>
            El menú de instrumentos (sección 5.2) tiene un trade-off real entre rendimiento y volatilidad: el instrumento con el rendimiento nominal
            más alto puede dejar de ser la mejor opción una vez ajustas por riesgo. Antes de construir tu calendario, considera:
          </p>
          <ul className="list-disc pl-5">
            <li>
              <strong>Mide la relación rendimiento/riesgo.</strong> Compara cuánto rendimiento adicional te da cada instrumento por cada punto extra
              de volatilidad que asumes frente a uno más conservador.
            </li>
            <li>
              <strong>Concentrar todo en un solo instrumento tiene un costo aparte de su volatilidad.</strong> Aunque sea el instrumento con mejor
              relación rendimiento/riesgo del menú, quedarte 100% en uno solo descuenta tu Rendimiento — repartir entre varios de los instrumentos con
              plazo propio (CDT90/TES1/TES3/TESUVR8) baja ese descuento, incluso si tu volatilidad promedio termina siendo parecida. LIQ queda por
              fuera de este descuento, porque cuenta como colchón de liquidez. Este mismo criterio de concentración vuelve a ser relevante más
              adelante en el ejercicio — entender por qué tu nota de hoy bajó te va a servir después.
            </li>
            <li>
              <strong>Mantén un colchón para los meses de caja ajustada.</strong> LIQ es el único instrumento que puedes retirar sin penalización —
              algo de saldo ahí te evita la venta forzada cuando falte caja en un mes puntual.
            </li>
            <li>
              <strong>Cada instrumento tiene su propio ritmo de vencimiento, fijo.</strong> LIQ vuelve a estar disponible cada mes; los TES/CDT vencen en
              su plazo propio; ACC vence cada 12 meses. Ese ritmo viene dado; lo que eliges es qué hacer con el excedente cuando cada uno regresa,
              definiendo un cambio de estrategia en el mes que corresponda.
            </li>
            <li>
              <strong>Piensa en todo el calendario.</strong> Tu asignación del mes 0 se mantiene vigente hasta que agregues un cambio de estrategia
              más adelante — un portafolio que se ve bien al inicio y queda sin revisar puede dejarte atrapado en instrumentos poco líquidos justo
              cuando aparece un mes de caja ajustada.
            </li>
          </ul>
        </SubSection>

        <PreguntasAbiertas>
          <li>¿Qué otras variables (más allá del historial de siniestros) usarías para diferenciar la retarifación de 2028 de la de 2027?</li>
          <li>¿Cómo cambiaría tu calendario de portafolio si tu horizonte no fuera de 2 años sino de 10?</li>
          <li>¿Qué le pasaría a tu Resultado de Inversiones si una recesión bajara el rendimiento de los instrumentos más riesgosos del menú?</li>
          <li>¿Qué pasa con la solución de esquina ACC = 100%?</li>
        </PreguntasAbiertas>
      </Section>

      <Section n="5" title="Plantillas — cómo se construyen y cómo alimentan el resultado">
        <p>
          Esta sección te muestra la <strong>estructura</strong> exacta que va a evaluar el motor, vacía, para que puedas planear tu estado de resultados
          y tu calendario en papel antes de construirlos en los formularios. Las fórmulas de calificación que aparecen aquí son las mismas que vas a ver, ya
          resueltas con tus números, en los resultados objetivos después de guardar cada entregable.
        </p>

        <FlowStep n="1" title="5.1 · Estado de resultados — 2027">
          <StatementTemplate
            rowLabels={PYG_ROWS}
            emphasizedLabels={["Resultado Técnico", "Resultado Industrial", "Utilidad antes de impuestos", "Utilidad neta"]}
            formulaNotes={[
              "RPND constituida. Cuando emites una póliza cobras la prima completa por adelantado, pero la cobertura se presta a lo largo del año siguiente — a cierre de 2027 todavía le debes al asegurado varios meses de protección. La RPND constituida es la porción de esa prima emitida que reservas porque corresponde a riesgo que aún no has corrido, y sigue siendo un pasivo hasta que esa cobertura se preste. En este ejercicio esa porción es un 20% fijo de la prima emitida, una simplificación del cálculo pro-rata real.",
              "Prima devengada. Es el complemento de lo anterior: la parte de la prima emitida que sí corresponde a cobertura ya prestada durante el año, y que por tanto sí es ingreso ganado. En 2027 equivale exactamente al 80% de la prima emitida, porque es el primer año del ejercicio y todavía queda por delante la primera reserva por liberar. Desde 2028 se le suma además lo que se libera de la reserva constituida el año anterior, porque esa cobertura ya se prestó.",
              "Gastos de adquisición / Comisiones / administrativos. Estos tres gastos se calculan como el mismo porcentaje de la prima emitida que usaste en Día 1 para armar tu prima comercial — ahí los sumaste como recargos para fijar el precio; acá los restas como el gasto real que efectivamente representan. Es la misma tasa mirada desde el otro lado del negocio: primero como lo que le cobras al asegurado, ahora como lo que te cuesta operar. Con una excepción: si tercerizaste tus tarifas, tu gasto de adquisición de ese año sube al 12% — ver la nota de la sección 3.",
              "Resultado Técnico. Mide si el negocio de asumir riesgo, aislado del resto de la operación, es rentable por sí solo: lo que devengaste de prima, menos lo que pagaste en siniestros, menos lo que gastaste en colocar y adquirir las pólizas. El gasto administrativo queda deliberadamente afuera de esta línea: es el costo de sostener la compañía como estructura, y por eso se resta más abajo.",
              "Resultado Industrial. Toma el Resultado Técnico y le resta el gasto administrativo, el costo de operar la aseguradora como empresa, independiente de cuántas pólizas coloques. Es la utilidad completa del negocio asegurador — suscripción más administración — antes de mezclarla con lo que ganaste o perdiste invirtiendo el dinero de tus reservas y tu capital.",
              "Resultado de inversiones. Esta línea sale directamente de simular tu calendario de decisiones de portafolio mes a mes contra la caja real (secciones 5.2 a 5.6): depende de qué instrumentos elegiste, cuánto rindieron y qué tan bien tu caja acompañó esas decisiones.",
              "Utilidad antes de impuestos. Suma el Resultado Industrial (lo que ganaste asegurando y administrando la compañía) con el Resultado de Inversiones (lo que ganaste o perdiste invirtiendo mientras tanto) — una aseguradora gana por los dos caminos a la vez, y esta línea los junta antes de pagar impuestos.",
              "Impuesto. Se calcula como el 30% de la utilidad antes de impuestos, y solo cuando esa utilidad es positiva: un año que cierra en pérdida queda con impuesto en cero, porque falta base sobre la cual tributar.",
              "Utilidad neta. Es lo que queda para la aseguradora después de restar el impuesto a la utilidad antes de impuestos — la línea final del P&G, y la que resume en un solo número si el año, entre suscripción, administración e inversiones, fue rentable.",
            ]}
          />
        </FlowStep>

        <FlowStep n="2" title="5.2 · Instrumentos disponibles">
          <InstrumentsTable />
          <p className="text-[15px] italic text-[var(--color-brand-text-secondary)]">
            Asume que los plazos (tanto vencimientos como cupones) se cuentan desde el momento en que compras el instrumento, independientemente del
            mes calendario.
          </p>
          <p>
            <strong>Matriz de covarianza</strong> entre los 6 instrumentos — la volatilidad de cada uno (columna anterior) sale de su diagonal; el
            resto de la matriz es lo que hace que combinar instrumentos reduzca el riesgo más que cualquiera de ellos por separado.
          </p>
          <MatrixTable />
        </FlowStep>

        <FlowStep n="3" title="5.3 · Tu calendario de decisión — plantilla en blanco">
          <p className="text-sm text-[var(--color-brand-text-secondary)]">
            Antes de esta tabla, el formulario te pide una asignación aparte para tu Capital Social (mismo menú de instrumentos, sin fila de mes —
            entra completo al mes 0). Una vez enviada, esa plata se mezcla con todo lo demás y de ahí en adelante sigue el calendario de abajo igual
            que la prima.
          </p>
          <BlankTable
            headers={["¿Desde qué mes aplica?", "Instrumento (del menú de 5.2)", "% asignado"]}
            rows={6}
            note="La primera fila siempre es el mes 0 (tu asignación inicial para la prima). Cada fila adicional es un cambio de estrategia: desde ese mes, el excedente disponible (incluyendo lo que venza) se reparte según esos nuevos porcentajes, hasta el siguiente cambio que definas. LIQ vuelve a estar disponible cada mes, los TES/CDT en su propio plazo, y ACC cada 12 meses; todo lo que vence entra a la misma bolsa del mes en que vence."
          />
        </FlowStep>

        <FlowStep n="4" title="5.4 · Cómo se traduce tu calendario en caja, mes a mes — plantilla del estado de caja">
          <BlankTable
            headers={["Mes", "Caja Inicial", "Prima Cobrada", "Pago Siniestros", "Gastos", "Vencimientos en caja", "Inversión Neta", "Caja Final"]}
            rows={4}
            note="Caja Final = Caja Inicial + Prima Cobrada − Pago Siniestros − Gastos + Vencimientos en caja + Inversión Neta. El motor repite esta cuenta 108 veces (108 meses) aplicando el calendario de la sección 5.3. Inversión Neta se suma porque su signo ya lleva la dirección del efectivo: negativa el mes que inviertes un excedente (sale caja hacia el portafolio), positiva el mes que necesitas cubrir un faltante (entra efectivo a la caja) — ver la nota de abajo."
          />
          <InfoNote>
            <p className="text-xs text-[var(--color-brand-text-secondary)]">
              <span className="font-semibold text-[var(--color-brand-blue-accent)]">Qué cuenta como "Vencimientos en caja" — </span>
              son tres fuentes distintas de efectivo que libera tu portafolio ese mes. <strong>(1)</strong> Un instrumento
              (CDT90, TES1, TES3, TESUVR8) que llega a su propio plazo (3, 12, 36 o 96 meses): todo su valor en libros se libera como caja ese mes; si es TES3
              o TESUVR8, su último cupón viaja empaquetado junto con el principal, como un solo pago final. <strong>(2)</strong> El cupón anual de una
              posición TES3 o TESUVR8 que sigue abierta: cada 12 meses desde que se fondeó, paga en efectivo un cupón (su valor en libros × su tasa); el
              principal se queda invertido exactamente igual, y solo entra a caja ese pedazo de rendimiento.{" "}
              <strong>(3)</strong> LIQ, que el motor trata como si "venciera" cada mes: cualquier saldo asignado a LIQ se cuenta como vencimiento el mes
              siguiente a que entró. Por eso vas a ver valores en esta columna casi desde el Mes 1, mucho antes de que el primer CDT90 llegue a su plazo:
              así es como el motor modela que LIQ está disponible de inmediato cada mes.
            </p>
          </InfoNote>
          <InfoNote>
            <p className="text-xs text-[var(--color-brand-text-secondary)]">
              <span className="font-semibold text-[var(--color-brand-blue-accent)]">Una posición TES3/TESUVR8 rinde todos los meses, aunque su cupón se pague una vez al año — </span>
              su valor en libros se queda fijo en el principal durante toda su vida (igual que un bono real, cuyo principal se mantiene entre cupones), y el
              interés se reconoce cada mes a medida que se devenga: cada mes que la posición sigue abierta suma valor en libros × (su tasa ÷ 12) a un
              acumulado interno, y ese acumulado es lo que se paga como cupón — y vuelve a cero — en la fecha de pago. En la práctica esto quiere decir que
              vas a ver rendimiento genuino en tu estado de caja incluso en un mes donde "Vencimientos en caja" para esa posición está en $0, porque el
              interés ya se está devengando aunque el efectivo llegue después.
            </p>
          </InfoNote>
          <InfoNote>
            <p className="text-xs text-[var(--color-brand-text-secondary)]">
              <span className="font-semibold text-[var(--color-brand-blue-accent)]">Cómo se determina cuánto se invierte cada mes — </span>
              primero se calcula la Caja Disponible = Caja Inicial + Prima Cobrada − Pago Siniestros − Gastos + Vencimientos en caja. Esa Caja Disponible se
              compara contra la Caja Mínima obligatoria de ese mes (15% × [Prima Cobrada + Pago Siniestros]): si la excede, <strong>todo el excedente</strong>{" "}
              (Caja Disponible − Caja Mínima, que es la base de la inversión de ese mes) se invierte según el checkpoint vigente ese mes en tu calendario de la
              sección 5.3, y la Inversión Neta de ese mes queda registrada en <strong>negativo</strong>, por ese mismo monto: es efectivo que salió de la caja
              hacia el portafolio.
              La Caja Final siempre termina siendo exactamente esa Caja Mínima, ni un peso más ni menos. Cuando la Caja Disponible se queda corta, ese mes se
              dedica a cubrir el faltante: se drena primero LIQ (sin costo), luego se vende el resto del portafolio empezando por lo menos volátil (penaliza tu
              nota de Venta forzada), y si aun así falta, se compromete Capital Social (penaliza tu nota de Cumplimiento de Caja Mínima); ese faltante cubierto
              queda registrado en la Inversión Neta en <strong>positivo</strong> — efectivo que entró a la caja ese mes. La Caja Mínima siempre queda cubierta.
            </p>
          </InfoNote>
          <FlagCallout>
            <span className="font-semibold">Importante — </span>
            la Prima Cobrada que usa esta simulación (la que califica tu nota ALM de hoy) es <strong>ficticia</strong>: asume que cada mes entra exactamente
            1/12 de tu reserva total, subida lo justo para que, después de pagar el 25% de gastos de esta misma simulación, lo que quede alcance para esa
            reserva — ni más ni menos. Es intencional — el ejercicio evalúa la calidad de tu calendario de decisión de forma aislada del resultado de tu
            tarifa, para que dos equipos con el mismo calendario obtengan la misma nota de ALM. Cuando reportes el P&G real, vas a necesitar razonar cómo
            cambiarían estas cifras con tu prima real.
          </FlagCallout>
          <InfoNote>
            <p className="text-xs text-[var(--color-brand-text-secondary)]">
              <span className="font-semibold text-[var(--color-brand-blue-accent)]">
                ¿El Resultado de inversiones del P&G usa el rendimiento real o el rendimiento ajustado por riesgo?{" "}
              </span>
              El real. Resultado de inversiones (sección 5.1) es el ingreso de inversión que tu portafolio efectivamente devengó ese año dentro de esta
              simulación — la suma mes a mes de lo que rindió cada posición (intereses, cupones, crecimiento de las acciones), un valor en pesos, en bruto.
              El "Rendimiento ajustado por riesgo" de la sección 5.5 es una nota aparte, en escala 0-100, que califica qué tan bien armaste tu calendario de
              decisión y se queda en la calificación.
            </p>
            <p className="mt-2 text-xs text-[var(--color-brand-text-secondary)]">
              <span className="font-semibold text-[var(--color-brand-blue-accent)]">Cómo se calcula el rendimiento ajustado por riesgo — </span>
              es un Sharpe ratio real: (rendimiento efectivo anualizado de tu portafolio a lo largo de los 108 meses
              de esta simulación − tasa libre de riesgo) ÷ volatilidad de portafolio, menos una penalización aparte por concentración. La{" "}
              <strong>tasa libre de riesgo es el 5.0% nominal de LIQ</strong> (sección 5.2) — el instrumento más seguro y líquido del menú funciona como
              el ancla: tu retorno solo cuenta como &ldquo;premio por riesgo&rdquo; en la parte que supera lo que ya conseguirías sin arriesgar nada. La
              volatilidad del denominador es la volatilidad real de la combinación, calculada cada mes contra la misma matriz de covarianza de la sección 5.2
              (así que premia diversificar entre instrumentos que se mueven de forma distinta), ponderada por cuánto tuviste en libros de cada uno a lo largo
              del horizonte completo. Aparte de ese cociente, se resta 0.5 × qué tan concentrado quedó tu riesgo en un solo instrumento (0 = tu exposición
              fuera de LIQ está repartida pareja entre los demás instrumentos del menú, 1 = está toda en uno solo; LIQ queda por fuera de este cálculo,
              porque mantener caja es ausencia de riesgo). El resultado se normaliza a una escala de 0 a 100 entre un piso y un techo.
            </p>
          </InfoNote>
        </FlowStep>

        <FlowStep n="5" title="5.5 · Las 4 notas — plantilla de calificación">
          <div className="flex flex-col gap-3 rounded border border-[var(--color-brand-gray-light)] bg-[var(--color-brand-blue-light)] p-4">
            <p className="text-xs uppercase text-[var(--color-brand-text-secondary)]">Nota final del ALM</p>
            <p className="flex h-10 w-32 items-center justify-center rounded border border-dashed border-[var(--color-brand-gray-light)] font-[family-name:var(--font-condensed)] text-lg font-bold text-[var(--color-brand-text-secondary)]">
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
              formula="normalizado de ([rendimiento efectivo simulado − tasa libre de riesgo (LIQ, 5.0%)] ÷ volatilidad de portafolio [con correlaciones, sección 5.2] − 0.5 × concentración del portafolio [0 a 1, excluye LIQ])"
            />
            <ScoreCard label="Venta forzada de portafolio" weight="20%" formula="100 × (1 − severidad de lo vendido bajo presión, ponderada por volatilidad)" />
            <ScoreCard label="Liquidez" weight="10%" formula="100 × min(1, líquido disponible ÷ pagos esperados en los próximos 6 meses)" />
          </div>
          <InfoNote>
            <p className="text-xs text-[var(--color-brand-text-secondary)]">
              <span className="font-semibold text-[var(--color-brand-blue-accent)]">Cómo se calcula la severidad de venta forzada — </span>
              cada vez que el motor te vende algo bajo presión de caja (sección 5.4), ese monto se pondera por la volatilidad anual del instrumento
              vendido — vender ACC pesa mucho más que vender CDT90 por el mismo monto — y se acumula a lo largo de los 108 meses: Σ (monto vendido bajo
              presión ese mes × volatilidad anual de ese instrumento). Esa suma se compara contra el peor caso posible: toda la Caja Mínima exigida en
              el horizonte completo (Σ Caja Mínima de cada mes), si se hubiera tenido que cubrir vendiendo siempre el instrumento más volátil del menú
              (ACC), y se recorta a un máximo de 1. La nota de Venta forzada es 100 × (1 − esa severidad): 100 si nunca vendiste bajo presión, y llega a
              0 solo en ese caso extremo de cubrir toda tu Caja Mínima del horizonte vendiendo lo más volátil del menú cada vez. Vender LIQ queda fuera de
              esta severidad, porque drenarlo es gratis; el motor siempre lo agota primero antes de tocar el resto del portafolio.
            </p>
            <p className="mt-2 text-xs text-[var(--color-brand-text-secondary)]">
              <span className="font-semibold text-[var(--color-brand-blue-accent)]">Vender antes de tiempo también paga menos — </span>
              aparte del castigo a la nota de arriba, cada venta forzada recibe un precio por debajo del valor en libros de la posición. La fórmula
              exacta del descuento, para una posición del instrumento <em>i</em> vendida en el mes <em>t</em>:
            </p>
            <p className="mt-2 rounded border border-[var(--color-brand-gray-light)] bg-[var(--color-brand-surface)] px-3 py-2 font-mono text-xs text-[var(--color-foreground)]">
              descuento = 10% × (volatilidad<sub>i</sub> ÷ volatilidad máxima del menú)³ × (plazo restante<sub>i</sub> ÷ plazo total del instrumento<sub>i</sub>)
            </p>
          </InfoNote>
        </FlowStep>

        <FlowStep n="6" title="5.6 · El camino completo, de tu decisión a tu nota" last>
          <div className="rounded border border-[var(--color-brand-gray-light)] p-3">
            <p className="text-sm">
              Tu calendario (5.3) → se simula mes a mes contra la caja real (5.4) → sus resultados (capital comprometido, rendimiento, ventas forzadas,
              liquidez) alimentan las 4 notas (5.5) → esas 4 notas, ponderadas, son tu nota final de ALM de hoy.
            </p>
            <p className="mt-2 text-sm">
              El Resultado de Inversiones que reportas en tu P&G es un ejercicio aparte: para ese entregable vuelves a razonar tu calendario, esta vez con
              tu prima real (la que ya conoces) en lugar del supuesto de fondeo perfecto de esta plantilla. El objetivo de esta guía es que entiendas la
              mecánica completa desde ahora, para que ese siguiente paso sea un ajuste sobre algo que ya conoces.
            </p>
          </div>
        </FlowStep>
      </Section>
    </div>
  );
}
