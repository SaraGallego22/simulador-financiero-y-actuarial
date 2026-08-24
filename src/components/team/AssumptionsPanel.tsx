/**
 * Reglas fijas del mundo simulado que un equipo necesita tener presentes
 * desde el día 1. Nada de lo que el ejercicio deja deliberadamente por
 * estimar (inflación de costo de siniestros, modelo de frecuencia/severidad,
 * tope de cuota propio) aparece aquí.
 */
const ASSUMPTIONS: { title: string; body: string }[] = [
  {
    title: "Horizonte",
    body: "Se simulan dos años de operación, 2027 y 2028, cada uno con su propio mercado y sus propios siniestros. El 2029 se estima como entregable, a partir de esos dos años.",
  },
  {
    title: "Un siniestro por póliza al año",
    body: "Cada póliza tiene como máximo un siniestro en el año. La frecuencia es la probabilidad de ese único evento.",
  },
  {
    title: "El siniestro se paga 3 meses después del aviso",
    body: "Una vez la compañía conoce un siniestro, el pago se produce tres meses más tarde.",
  },
  {
    title: "Capital Social: $120.000.000.000 COP",
    body: "Todos los equipos arrancan con el mismo Capital Social y compiten sobre el mismo universo de 1.000.000 de exposiciones, con un tope de cuota de mercado por equipo.",
  },
];

export function AssumptionsPanel() {
  return (
    <div className="rounded-[var(--radius-lg)] border border-[var(--color-brand-gray-light)] bg-[var(--color-brand-surface)] p-5 shadow-[var(--shadow-sm)]">
      <h3 className="font-[family-name:var(--font-condensed)] text-sm font-bold uppercase tracking-wide text-[var(--color-brand-blue-accent)]">
        Supuestos clave del reto
      </h3>
      <p className="mt-1 text-xs text-[var(--color-brand-text-secondary)]">
        Las reglas del mundo simulado. Aplican a los cuatro días; cada guía las retoma donde hacen falta.
      </p>
      <dl className="mt-4 grid grid-cols-1 gap-x-6 gap-y-3 sm:grid-cols-2">
        {ASSUMPTIONS.map((a) => (
          <div key={a.title} className="border-t border-[var(--color-brand-gray-light)] pt-2">
            <dt className="text-xs font-semibold uppercase tracking-wide text-[var(--color-brand-blue-accent)]">
              {a.title}
            </dt>
            <dd className="mt-0.5 text-xs text-[var(--color-brand-text-secondary)]">{a.body}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}
