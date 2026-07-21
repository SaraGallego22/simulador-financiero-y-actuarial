/** Compact two-column reference block — what the team receives vs. what it must submit that day. Placed before Section 1 so it reads as an executive summary, not a numbered section (keeps every existing "ver sección N" cross-reference in the 4 guides stable). */
export function InsumosEntregables({ insumos, entregables }: { insumos: string[]; entregables: string[] }) {
  return (
    <div className="grid overflow-hidden rounded-lg border border-[var(--color-brand-gray-light)] sm:grid-cols-2 print:break-inside-avoid">
      <div className="bg-[var(--color-brand-blue)] p-4">
        <p className="mb-2 inline-block border-b-2 border-[var(--color-brand-yellow)] pb-1 font-[family-name:var(--font-condensed)] text-sm font-bold uppercase tracking-wide text-white">
          Insumos
        </p>
        <ul className="flex flex-col gap-1.5 text-sm text-white/90">
          {insumos.map((item) => (
            <li key={item} className="flex gap-2">
              <span className="text-[var(--color-brand-yellow)]">•</span>
              <span>{item}</span>
            </li>
          ))}
        </ul>
      </div>
      <div className="bg-[var(--color-brand-surface)] p-4">
        <p className="mb-2 inline-block border-b-2 border-[var(--color-brand-cyan)] pb-1 font-[family-name:var(--font-condensed)] text-sm font-bold uppercase tracking-wide text-[var(--color-brand-blue-accent)]">
          Entregables
        </p>
        <ul className="flex flex-col gap-1.5 text-sm text-[var(--color-foreground)]">
          {entregables.map((item) => (
            <li key={item} className="flex gap-2">
              <span className="text-[var(--color-brand-cyan)]">•</span>
              <span>{item}</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

/** Yellow reflection callout — questions that widen the team's thinking beyond the graded/objective criteria. Never scored, so framed explicitly as optional. */
export function PreguntasAbiertas({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-lg bg-[var(--color-brand-yellow)] p-4 print:break-inside-avoid">
      <p className="mb-2 font-[family-name:var(--font-condensed)] text-sm font-bold uppercase tracking-wide text-[var(--color-brand-blue)]">
        Preguntas abiertas <span className="font-normal normal-case">— no se califican, son para profundizar en equipo</span>
      </p>
      <ul className="flex list-disc flex-col gap-1.5 pl-5 text-sm text-[var(--color-brand-blue)]">{children}</ul>
    </div>
  );
}

/** One step of a numbered, dashed-line-connected process flow — used inside the "Plantillas" section to show the build order at a glance. Pass `last` on the final step to omit its trailing connector. */
export function FlowStep({ n, title, last, children }: { n: string; title: string; last?: boolean; children: React.ReactNode }) {
  return (
    <div className="flex gap-3">
      <div className="flex flex-col items-center">
        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[var(--color-brand-blue-accent)] font-[family-name:var(--font-condensed)] text-xs font-bold text-white">
          {n}
        </span>
        {!last && <span className="my-1 w-0 flex-1 border-l-2 border-dashed border-[var(--color-brand-blue-accent)]/40" />}
      </div>
      <div className={`flex flex-1 flex-col gap-3 ${last ? "" : "pb-5"}`}>
        <p className="text-xs font-semibold uppercase text-[var(--color-brand-text-secondary)]">{title}</p>
        {children}
      </div>
    </div>
  );
}
