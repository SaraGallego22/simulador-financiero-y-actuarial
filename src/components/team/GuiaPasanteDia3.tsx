import {
  FlowStep,
  FormulaNotes,
  GuiaHeader,
  InsumosEntregables,
  PreguntasAbiertas,
  Section,
  SubSection,
  tableClass,
  tableWrapClass,
  thClass,
  tdClass,
} from "./GuiaShared";
import { CHAIN_LADDER_TAIL_FACTOR } from "@/domain/reserving/constants";

/** Vertical financial-statement template with real row labels (unlike the generic ALM tables of Día 2, these have known line items) and one blank input column per year, so it visually matches DeliverablesForm's grouped rendering. */
function StatementTemplate({ rowLabels, columns, emphasizedLabels, formulaNotes }: { rowLabels: string[]; columns: string[]; emphasizedLabels?: string[]; formulaNotes?: string[] }) {
  return (
    <div className="flex flex-col gap-3">
      <div className={`${tableWrapClass} overflow-x-auto`}>
        <table className={tableClass}>
          <thead>
            <tr>
              <th className={thClass}>Línea</th>
              {columns.map((c) => (
                <th key={c} className={thClass}>
                  {c}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rowLabels.map((label) => (
              <tr key={label}>
                <td className={`${tdClass} ${emphasizedLabels?.includes(label) ? "font-semibold" : ""}`}>{label}</td>
                {columns.map((c) => (
                  <td key={c} className={`h-8 ${tdClass}`}>
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

// Año 3 no tiene línea de Ajuste de siniestralidad — esa línea libera un
// 10% puntual de la reserva técnica real de cierre de 2027 (Año 1), un
// hecho que no se repite para Año 2 (ver sección 4).
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
  "Necesidades de patrimonio o deuda",
  "Pasivo total",
  "Patrimonio",
  "Pasivo + Patrimonio",
];

export function GuiaPasanteDia3() {
  return (
    <div className="flex flex-col gap-8 text-[var(--color-foreground)]">
      <GuiaHeader
        dia={3}
        subtitulo="Estado de resultados 2028/2029 (proy.) y Balance"
        intro="Esta es tu herramienta principal para abordar el reto de hoy. Léela antes de construir tus estados financieros: te explica exactamente qué se va a calificar, con qué criterios, y qué conceptos debes tener en cuenta."
      />

      <InsumosEntregables
        insumos={[
          "Siniestros propios del 2027 avisados en 2027 y en 2028, más siniestros propios del 2028 avisados en 2028 — con fecha exacta de siniestro y de aviso, para armar tu propio triángulo de desarrollo mensual (Chain Ladder, sección 2).",
          "Pagos reales del 2028 sobre los siniestros del 2027 (desarrollo) y los siniestros propios del 2028.",
          "Capital comprometido acumulado y rendimiento real devengado por tu ALM real de 2027/2028.",
          "Retención real de pólizas de 2027 a 2028, para proyectar el 2029.",
        ]}
        entregables={[
          "Estado de resultados completo del 2028 (15 líneas) y proyección del 2029 (14 líneas).",
          "Balance de 2027, 2028 y 2029 (11 líneas cada uno).",
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
            del Balance de cada año — siempre el saldo real de siniestralidad menos lo pagado hasta ese punto.
          </li>
          <li>
            <strong>Financiero — estados de resultados completos de 2028 (15 líneas) y 2029 proyectado (14 líneas).</strong> La misma estructura que
            reportaste para el 2027 en Día 2, con dos diferencias: cada año libera la Reserva de Prima No Devengada que el año anterior constituyó
            (además de constituir la propia), y 2028 además carga &ldquo;Ajuste de siniestralidad&rdquo; — la liberación del 10% de la reserva técnica
            real de cierre de 2027 (ver sección 4) — como su propia línea, exclusiva de ese año.
          </li>
          <li>
            <strong>Financiero — Balance de 2027, 2028 y 2029.</strong> El mismo balance simplificado (caja, inversiones, cuentas por cobrar/pagar,
            reservas técnicas, Reserva de Prima No Devengada, patrimonio) para los tres años, terminando en el chequeo contable Pasivo + Patrimonio =
            Activos.
          </li>
          <li>
            <strong>Financiero — Portafolio 2028 (opcional).</strong> Ahora que ya conoces tu prima real del 2028, puedes reestructurar tu estrategia de
            inversión para lo que resta de ese año en la pestaña de Entregables — misma estructura que el portafolio de Día 2. Si lo guardas,
            reemplaza por completo tu calendario del 2028 en adelante; si lo dejas como está, tu 2028 sigue con el mismo calendario que armaste en
            Día 2. Su único efecto es ese: cambiar qué calendario alimenta tu ALM real del 2028.
          </li>
        </ul>
      </Section>

      <Section n="2" title="Teoría necesaria">
        <p className="text-[15px] italic text-[var(--color-brand-text-secondary)]">
          El desarrollo exacto de tu propia cartera lo estimas tú — esta sección explica el método con el que se hace.
        </p>

        <SubSection title="Reservas técnicas y desarrollo de siniestros (Chain Ladder / IBNR)" accent="act">
          <p>
            El pago de un siniestro se reparte en el tiempo: hay un proceso de aviso, ajuste y pago que puede tomar varios años, y una
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
            — el costo <strong>último</strong> es la suma de lo ya avisado más ese IBNR. Este ejercicio usa un triángulo de <strong>avisados</strong>:
            la severidad de un siniestro queda fija desde el momento en que se avisa, así que el monto avisado acumulado ya es una base de desarrollo
            directa.
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
            ninguna. Un fragmento ilustrativo de 4 de tus 24 filas posibles, con números de ejemplo:
          </p>
          <div className={`${tableWrapClass} overflow-x-auto`}>
            <table className={tableClass}>
              <thead>
                <tr>
                  <th className={thClass}>Mes de ocurrencia</th>
                  <th className={thClass}>Desarrollo 0</th>
                  <th className={thClass}>Desarrollo 1</th>
                  <th className={thClass}>Desarrollo 2</th>
                  <th className={thClass}>Desarrollo 3</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td className={`${tdClass} font-semibold`}>Oct 2027</td>
                  <td className={tdClass}>$40</td>
                  <td className={tdClass}>$55</td>
                  <td className={tdClass}>$62</td>
                  <td className={tdClass}>$65</td>
                </tr>
                <tr>
                  <td className={`${tdClass} font-semibold`}>Nov 2027</td>
                  <td className={tdClass}>$38</td>
                  <td className={tdClass}>$52</td>
                  <td className={tdClass}>$59</td>
                  <td className={`${tdClass} italic text-[var(--color-brand-text-secondary)]`}>?</td>
                </tr>
                <tr>
                  <td className={`${tdClass} font-semibold`}>Dic 2027</td>
                  <td className={tdClass}>$42</td>
                  <td className={tdClass}>$57</td>
                  <td className={`${tdClass} italic text-[var(--color-brand-text-secondary)]`}>?</td>
                  <td className={`${tdClass} italic text-[var(--color-brand-text-secondary)]`}>?</td>
                </tr>
                <tr>
                  <td className={`${tdClass} font-semibold`}>Ene 2028</td>
                  <td className={tdClass}>$45</td>
                  <td className={`${tdClass} italic text-[var(--color-brand-text-secondary)]`}>?</td>
                  <td className={`${tdClass} italic text-[var(--color-brand-text-secondary)]`}>?</td>
                  <td className={`${tdClass} italic text-[var(--color-brand-text-secondary)]`}>?</td>
                </tr>
              </tbody>
            </table>
          </div>
          <p>
            Con más de dos columnas hay más de un factor edad a edad: 0→1 (promediando las filas que ya tienen ambas edades: Oct, Nov y Dic ≈ 1.37),
            1→2 (Oct y Nov ≈ 1.13) y 2→3 (solo Oct ≈ 1.05). Para proyectar una fila incompleta se <strong>encadenan</strong> tantos factores como
            haga falta — Nov solo necesita el último (59 × 1.05 ≈ 62), pero Ene 2028 necesita los tres seguidos (45 × 1.37 × 1.13 × 1.05 ≈ 73). Esa
            cadena de factores sucesivos es justo lo que le da su nombre al método — un triángulo anual, con solo dos columnas, se queda en un único
            eslabón.
          </p>
          <p>
            Ese factor edad a edad lo calculas tú, con tus propios datos: es justamente lo que Chain Ladder te pide estimar.
            Encadenándolos puedes llevar cualquiera de tus filas hasta la edad más madura que alcances con tu propia
            información: cerca de 24 meses para tus meses de ocurrencia de comienzos del 2027.
          </p>
          <p>
            Incluso esa edad más madura se queda algo corta: con un rezago de aviso que puede llegar hasta 730 días (~2 años) desde la ocurrencia,
            sigue quedando un remanente muy pequeño de siniestros del 2027 por avisar a estas alturas. Ese remanente se cubre con un factor de cola
            — este, a diferencia de los edad a edad, sí te lo damos, porque estimarlo exigiría ver lo que pasa después del corte de tu reporte:
          </p>
          <div className="rounded border border-[var(--color-brand-gray-light)] bg-[var(--color-brand-blue-light)] p-4 text-center">
            <p className="font-[family-name:var(--font-condensed)] text-base font-bold text-[var(--color-brand-blue-accent)] sm:text-lg">
              Costo Último = Monto desarrollado a tu edad más madura observable (~24 meses) × {CHAIN_LADDER_TAIL_FACTOR}
            </p>
          </div>
          <p className="text-[15px] italic text-[var(--color-brand-text-secondary)]">
            Un factor pequeño (~0.3%) a propósito: con esta distribución de rezago de aviso, la enorme mayoría de los siniestros ya se conoce a los
            24 meses. Sigue siendo positivo — por eso Chain Ladder real siempre incluye un factor de cola, aunque sea modesto — y queda muy por
            debajo del ajuste que traen los factores edad a edad que calculas tú mismo, encadenados.
          </p>
          <p>
            <strong>Esta es una forma de estimar distinta a la que usaste en Día 2.</strong> El método Expected Loss Ratio parte de un supuesto
            externo (tu propio loss ratio esperado, anclado en tu tarifa) multiplicado por la prima — el único camino disponible en Día 2, cuando
            todavía faltaban datos de desarrollo propios. Chain Ladder proyecta el costo último a partir de cómo se desarrolló tu propia experiencia
            real, con tus datos como única entrada. Son dos filosofías distintas: una asume un resultado externo mientras la experiencia propia es
            escasa; la otra confía por completo en esa experiencia una vez ya tiene forma de desarrollarse. Lo que cambió entre un día y otro es
            cuántas columnas de tu triángulo existen: en Día 2 tu reporte solo daba una columna (12 meses) para el 2027 completo, una sola edad, de
            ahí la necesidad del ELR. Hoy tu triángulo mensual cubre 2027 y 2028 a la vez, evaluados en el mismo corte (fin de 2028): tus meses de
            2027 más maduros te dan los factores edad a edad, y esos mismos factores encadenados también proyectan tus meses de 2028 más recientes,
            así que Chain Ladder alcanza para los dos años.
          </p>
        </SubSection>

        <SubSection title="El Balance: qué es y cómo se arma" accent="fin">
          <p>
            El estado de resultados mide un <strong>flujo</strong>: todo lo que entró y salió durante un periodo (el 2028, por ejemplo). El Balance
            mide algo distinto — una <strong>foto fija</strong> de lo que la aseguradora tiene y debe en un instante preciso, al cierre de cada año
            (2027, 2028 y 2029). Cada año tiene su propio Balance, y el patrimonio de un año arrastra el del anterior más lo que ese año generó.
          </p>
          <p>
            Toda esa foto se organiza alrededor de una identidad que siempre debe cumplirse exactamente: <strong>Activos = Pasivo + Patrimonio</strong>.
            Activos es todo lo que la aseguradora posee o tiene derecho a cobrar; Pasivo es todo lo que le debe a terceros (asegurados incluidos);
            Patrimonio es lo que le queda al dueño del negocio una vez se descuentan esas obligaciones — por construcción, el número que cierra la
            ecuación.
          </p>
          <p>
            <strong>Activos:</strong> Caja (efectivo disponible de inmediato — sale de tu propia gestión de flujo de caja real ese año), Inversiones
            (el valor que tu portafolio real de Día 2 efectivamente tiene invertido a esa fecha, Capital Social incluido, ver más abajo) y Cuentas por
            cobrar (prima ya emitida que sigue pendiente de cobro — la aseguradora tiene una rotación de cartera de 30 días sobre su prima emitida).
            Activos totales es la suma de esas tres.
          </p>
          <p>
            <strong>Pasivo:</strong> Reservas técnicas (lo que falta por pagar de siniestros ya incurridos — RSA + IBNR, siempre el saldo real
            pendiente), RPND (la parte de la prima ya cobrada que corresponde a cobertura de un periodo futuro todavía por transcurrir — una
            obligación de seguir cubriendo el riesgo) y Cuentas por pagar (otras obligaciones operativas pendientes). A esas se suma una cuarta línea,{" "}
            <strong>Necesidades de patrimonio o deuda</strong> — distinta de cero solo si tu aseguradora agotó por completo su portafolio real
            (Capital Social incluido) y aun así necesitó más para cubrir un faltante de caja: ese exceso tuvo que salir de financiación fresca
            (capital nuevo o deuda), así que se reconoce como una obligación aparte. Para la inmensa mayoría de los equipos esta línea es cero.
            Pasivo total es la suma de las cuatro.
          </p>
          <p>
            <strong>Patrimonio</strong> es lo que queda para el dueño del negocio: Capital Social más la utilidad neta acumulada, menos cualquier
            financiamiento externo que hayas tenido que traer para cubrir una brecha de caja en tu ALM real (Necesidades de patrimonio o deuda,
            arriba). Se calcula por acumulación: el patrimonio del año anterior más la utilidad neta que ese año generó en el P&G. Es el punto
            exacto donde el estado de resultados (un flujo) termina alimentando al Balance (una foto).
          </p>
          <p>
            La última línea, <strong>Pasivo + Patrimonio</strong>, es la verificación de que toda la foto es consistente: debe coincidir exactamente
            con Activos totales. Cuando no cuadra, el error está en alguna de las líneas anteriores.
          </p>
        </SubSection>
      </Section>

      <Section n="3" title="Qué se te va a calificar">
        <SubSection title="Estado de resultados 2028" accent="fin">
          <p>
            El costo de siniestros del 2028 es, en <strong>base fecha de accidente</strong>, únicamente lo ocurrido dentro del 2028; lo del 2027 ya se
            reconoció como costo en el P&G de ese año, sin importar cuándo se avisara. Lo que sí es propio de este año es una línea aparte:{" "}
            <strong>Ajuste de siniestralidad (A1)</strong>. Gracias a una revisión realizada por el equipo actuarial de la compañía, se determinó que
            la severidad de los casos restantes por pagar de 2027 está sobreestimada en un 10% — tu equipo libera ese 10% de la reserva técnica real de
            cierre de 2027. Repórtala como un valor negativo, porque es una liberación: entra junto al costo antes de llegar al Resultado Técnico, y al
            ser negativa termina sumando a tu utilidad. Se calcula sobre la reserva técnica real de cierre de 2027, independiente de lo que tú mismo
            reportaste como Costo de Siniestros A1 en Día 2.
          </p>
          <p>
            Tu prima devengada del 2028 sale de un roll-forward entre dos reservas: liberas el 100% de la Reserva de Prima No Devengada que
            constituiste en 2027 y constituyes una nueva sobre tu prima emitida de 2028 — si tu prima creció o bajó de un año a otro, lo liberado y lo
            constituido difieren entre sí.
          </p>
          <p>
            El Resultado de inversiones es, otra vez, el ingreso real que tu calendario de portafolio devengó durante los 12 meses del 2028 — esta
            corrida continúa exactamente donde terminó el 2027 real (mismas posiciones abiertas, mismo capital comprometido acumulado).
          </p>
        </SubSection>

        <SubSection title="Estado de resultados 2029 (proyectado)" accent="fin">
          <p>
            El 2029 se <strong>proyecta</strong> en papel: el ejercicio simula dos años de mercado y de ALM, y este tercero lo estimas tú. Cada línea
            se proyecta con la lógica que le corresponde, y esas lógicas difieren entre sí.
          </p>
          <p>
            La prima depende de cuántas pólizas conservas (retención) y cuántas ganas de nuevo. El costo de siniestros de 2029 es <strong>solo</strong>{" "}
            el siniestro propio de 2029 proyectado, y esta vez sin línea de ajuste de siniestralidad: lo que sigue pagándose de siniestros de 2027/2028
            ya se reconoció como costo en su propio año de accidente, y sigue existiendo como saldo de reserva en el Balance (ver sección 5.2). Y el
            Resultado de inversiones lo razonas a partir de tu propio ALM real de 2028: qué rindió efectivamente tu portafolio, más allá de lo que su
            rendimiento nominal prometía. Ver sección 4 para cómo razonar cada pieza.
          </p>
        </SubSection>

        <SubSection title="Balance — 2027, 2028 y 2029" accent="fin">
          <p>
            El mismo balance simplificado para los tres años, construido a partir del estado de resultados de cada uno: cuánta caja, cuentas por cobrar e
            inversiones tienes (activos), cuánto debes en reservas técnicas, Reserva de Prima No Devengada (RPND) y cuentas por pagar (pasivo), y qué te
            queda (patrimonio). La RPND es la misma cifra que ya calculaste en el estado de resultados de ese año (lo que constituiste sobre tu prima
            emitida) — aquí aparece como pasivo, junto a las reservas técnicas. La última línea, Pasivo + Patrimonio, debe
            cuadrar exactamente con Activos totales — es la identidad contable básica, y una forma de verificar tu propio trabajo antes de enviarlo.
          </p>
          <p className="text-[15px] italic text-[var(--color-brand-text-secondary)]">
            Las reservas técnicas de cada año son siempre el saldo real por pagar (RSA + IBNR para el 2027; lo pendiente de ambos orígenes al cierre
            del 2028), y se reportan como una línea del Balance.
          </p>
        </SubSection>
      </Section>

      <Section n="4" title="Conceptos que debes aplicar">
        <p className="text-[15px] italic text-[var(--color-brand-text-secondary)]">
          Esto es una guía de razonamiento: reconstruir la relación exacta entre estos conceptos es parte de lo que se evalúa que tu equipo entienda.
        </p>

        <SubSection title="Para el desarrollo de siniestros" accent="act">
          <ul className="list-disc pl-5">
            <li>
              <strong>Costo incurrido y caja pagada son dos cosas distintas.</strong> Un siniestro puede estar reconocido como costo (afecta tu
              resultado técnico) mientras su pago sigue pendiente.
            </li>
            <li>
              <strong>El costo de siniestros de cada año es siempre en base fecha de accidente.</strong> El Costo de siniestros del 2028 es únicamente
              lo ocurrido en el 2028; la liberación del 10% de la reserva de 2027 va en una línea aparte, Ajuste de siniestralidad. Son dos ideas
              distintas: cuánto costó lo que pasó este año, y cuánta reserva de 2027 libera la revisión actuarial.
            </li>
          </ul>
        </SubSection>

        <SubSection title="Para la proyección del 2029" accent="fin">
          <p className="text-[15px] italic text-[var(--color-brand-text-secondary)]">
            Sin un mercado real que simular, cada línea necesita su propia regla, explícita y consistente.
          </p>
          <ul className="list-disc pl-5">
            <li>
              <strong>La prima crece por dos cosas — cuántas pólizas conservas, y cuánto cobras por cada una.</strong> Piensa en tu 2029 como pólizas
              retenidas de 2028 (a la misma tasa de retención que ya observaste de 2027 a 2028) más pólizas nuevas. Cada una de esas pólizas, a su vez,
              se ajusta con la misma tasa de inflación de siniestros del punto siguiente: un equipo que retarifica para 2029 traslada esa expectativa
              de inflación tanto a su costo como a su prima.
            </li>
            <li>
              <strong>El costo de siniestros de 2029 es solo el siniestro propio de 2029.</strong> La línea de Ajuste de siniestralidad es exclusiva
              del 2028: esa liberación del 10% es un hecho puntual sobre la reserva de 2027 (Año 1). Y lo que sigue pagándose de siniestros de 2027 y
              2028 (cada siniestro tiene 3 años de desarrollo — repasa la sección 4 de la guía de Día 2 si la tienes lejos) ya se reconoció como costo
              en el P&G de su propio año de accidente, y aquí sigue existiendo solo como saldo de reserva en el Balance.
            </li>
            <li>
              <strong>Para proyectar el siniestro propio de 2029, separa frecuencia de severidad.</strong> La frecuencia (cuántas pólizas de tu libro
              tienen siniestro) se mantiene estable salvo que tengas una razón concreta para moverla; la severidad (cuánto cuesta cada siniestro) sí
              cambia, por inflación. Proyéctalas por separado.
            </li>
            <li>
              <strong>¿Qué tasa de inflación de siniestros usar?</strong> La misma que ya estimaste y aplicaste para tarificar el 2028 (recuerda:
              mayor a la inflación general de referencia del 6%, ver la guía de Día 2) aplica otra vez para proyectar 2029. Puedes verificar qué tan
              bien le atinaste comparando la severidad promedio de tus propios siniestros reales entre 2027 y 2028.
            </li>
            <li>
              <strong>El Resultado de inversiones sale de lo que tu ALM real rindió.</strong> Parte de lo que tu portafolio efectivamente devengó en
              2028, más allá de lo que su calendario prometía en teoría — si tuviste que vender algo bajo presión o comprometer capital en 2028, eso
              también debería pesar en tu proyección de 2029.
            </li>
          </ul>
        </SubSection>

        <SubSection title="Para el Balance" accent="fin">
          <p>
            Antes de reportar, verifica tu propia identidad contable: Activos = Pasivo + Patrimonio, para cada uno de los tres años por separado.
            Cuando no cuadra, el error está en alguna de las líneas anteriores.
          </p>
          <p>
            <strong>Las líneas de Activos y Pasivo se calculan de formas distintas entre sí.</strong> Cuentas por pagar y RPND siguen siendo un
            porcentaje fijo de la prima emitida; Cuentas por cobrar sale de la rotación de cartera de 30 días (sección 3). Caja e Inversiones, en
            cambio, dependen de tu propio flujo de caja real ese año (lo que tu prima realmente cobrada alcanzó a cubrir, después de pagar siniestros
            y gastos) y de tu Capital Social.
          </p>
          <p>
            <strong>Inversiones es un número que puedes razonar directamente.</strong> Es lo que tu portafolio real de Día 2 efectivamente tiene
            invertido — Capital Social incluido, porque se invierte junto con tu calendario desde el arranque del 2027.
          </p>
          <p>
            <strong>Necesidades de patrimonio o deuda va del lado del Pasivo, y casi siempre es cero.</strong> Aparece solo si tu equipo agotó por
            completo su portafolio real (Capital Social incluido) y aun así necesitó más para cubrir un faltante de caja. Si tu equipo se quedó lejos
            de ese punto, esta línea es cero.
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
              "Prima devengada = Prima emitida − RPND constituida + RPND liberada — un roll-forward genuino entre las dos reservas.",
              "Gastos de adquisición / Comisiones / administrativos = 4% / 15% / 6% de la Prima emitida A2.",
              "Ajuste de siniestralidad (A1) = −10% × tu Reservas técnicas A1 (Balance 2027) — repórtalo en negativo, es una liberación.",
              "Resultado Técnico = Prima devengada − Costo − Ajuste de siniestralidad − Gadq − Gcom.",
              "Resultado Industrial = Resultado Técnico − Gasto administrativo.",
              "Impuesto = 30% × max(0, Utilidad antes de impuestos) — con piso en 0.",
            ]}
          />
        </FlowStep>

        <FlowStep n="2" title="5.1b · Estado de resultados — 2029 (proyectado)">
          <StatementTemplate
            rowLabels={PYG_A3_ROWS}
            columns={["2029 (proy.)"]}
            emphasizedLabels={["Resultado Técnico", "Resultado Industrial", "Utilidad antes de impuestos", "Utilidad neta"]}
            formulaNotes={[
              "Misma estructura que 2028; la línea de Ajuste de siniestralidad es exclusiva de ese año (ver sección 4).",
              "RPND liberada aquí usa tu Prima emitida A2 de la tabla de arriba.",
            ]}
          />
        </FlowStep>

        <FlowStep n="3" title="5.2 · Balance — 2027, 2028 y 2029 (proy.)">
          <StatementTemplate
            rowLabels={BALANCE_ROWS}
            columns={["2027", "2028", "2029 (proy.)"]}
            emphasizedLabels={["Activos totales", "Pasivo + Patrimonio"]}
            formulaNotes={[
              "Cuentas por pagar / RPND = 10% / 20% de la Prima emitida de ese año (la de 2027 la reportaste en Día 2).",
              "Cuentas por cobrar sale de la rotación de cartera de 30 días de la sección 3.",
              "Caja e Inversiones en 2027/2028 dependen de tu propio flujo de caja real y tu Capital Social. Para 2029, que se proyecta sin ALM propio, Caja vuelve al 15% de la Prima emitida de ese año.",
              "Necesidades de patrimonio o deuda va del lado del Pasivo — solo es distinta de 0 si tu equipo agotó por completo su portafolio real (Capital Social incluido) y aun así necesitó más. Para casi todos los equipos es 0.",
              "Pasivo total = Reservas técnicas + RPND + Cuentas por pagar + Necesidades de patrimonio o deuda.",
              "Pasivo + Patrimonio debe ser exactamente igual a Activos totales.",
            ]}
          />
        </FlowStep>

        <FlowStep n="4" title="5.3 · El camino completo, de tus decisiones a tu reporte" last>
          <div className="rounded border border-[var(--color-brand-gray-light)] p-3">
            <p className="text-sm">
              El costo real de siniestros del 2027 (4) + tu calendario de portafolio de Día 2 → alimentan el estado de resultados del 2028 (5.1) → que junto
              con la retención real de 2028 y el rendimiento realmente devengado por tu ALM real, te da la proyección del 2029 (5.1b) → cada año, junto
              con el capital comprometido de tu ALM real, te da el Balance de ese año (5.2).
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
