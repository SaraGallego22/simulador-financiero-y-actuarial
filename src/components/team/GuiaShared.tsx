import type { ReactNode } from "react";
import { INSTRUMENTS, displayYieldLabel } from "@/domain/finance/instruments";
import { COVARIANCE_MATRIX } from "@/domain/finance/markowitz";
import { AlertIcon, BarChartIcon, ChatIcon, FlaskIcon, InfoIcon } from "@/components/ui/icons";

/**
 * Shared visual system for the 4 Guía del pasante pages. The shapes here
 * (badges, pill tabs, dashed "worksheet" borders, the notched flag, the
 * dotted rule) are the design language for the whole guide — kept in one
 * place so all 4 days read as one document instead of 4 independently
 * hand-rolled ones. Days import these instead of redefining their own
 * Section/SubSection/BlankTable/FormulaNotes (previously copy-pasted
 * identically in all 4 files).
 */

const INSTRUMENT_IDS = INSTRUMENTS.map((ins) => ins.id);

/** Shared table shape — dashed "worksheet" borders instead of solid ruled lines, rounded outer wrapper. Exported so day-local tables (StatementTemplate, ScoreCard) that can't fully merge into a shared component still render with the same shape. */
export const tableWrapClass = "overflow-hidden rounded-[var(--radius-md)] border border-dashed border-[var(--color-brand-gray-light)]";
export const tableClass = "w-full border-collapse text-xs";
export const thClass = "border-b border-r border-dashed border-[var(--color-brand-gray-light)] bg-[var(--color-brand-blue-light)] px-2 py-1.5 text-left font-semibold text-[var(--color-brand-blue-accent)] last:border-r-0";
export const tdClass = "border-b border-r border-dashed border-[var(--color-brand-gray-light)] px-2 py-1.5 last:border-r-0";

/** Dotted rule with circular end-caps — the header's signature flourish, echoing the printed guide's divider. Decorative only. */
function DottedRule({ className = "" }: { className?: string }) {
  return (
    <div className={`flex items-center gap-2 ${className}`} aria-hidden>
      <span className="h-2 w-2 shrink-0 rounded-full bg-[var(--color-brand-yellow)]" />
      <span className="h-0 flex-1 border-t-2 border-dotted border-[var(--color-brand-yellow)]" />
      <span className="h-2 w-2 shrink-0 rounded-full bg-[var(--color-brand-yellow)]" />
    </div>
  );
}

/** Page header — full-bleed brand-blue banner (replaces the old white card with a thin gray top border) with the two-tier "Guía del pasante / Día N — subtítulo" title and the dotted-rule flourish beneath it. */
export function GuiaHeader({ dia, subtitulo, intro }: { dia: number; subtitulo: string; intro: string }) {
  return (
    <header className="overflow-hidden rounded-[var(--radius-xl)] bg-[var(--color-brand-blue)] p-6 text-white shadow-[var(--shadow-md)] sm:p-8 print:break-inside-avoid print:shadow-none">
      <p className="text-xs font-semibold uppercase tracking-[0.2em] text-white/70">Pasantía Técnica · Seguros SURA</p>
      <h1 className="mt-2 font-[family-name:var(--font-condensed)] text-xl font-medium text-white/80">Guía del pasante</h1>
      <h2 className="font-[family-name:var(--font-condensed)] text-3xl font-bold leading-tight sm:text-4xl">
        Día {dia} <span className="text-[var(--color-brand-yellow)]">—</span> {subtitulo}
      </h2>
      <DottedRule className="my-4 max-w-md" />
      <p className="max-w-3xl text-sm text-white/90">{intro}</p>
    </header>
  );
}

/** Footer band matching the printed guide's credit line — mounted once per page, after the day's content. */
export function GuiaFooter() {
  return (
    <footer className="flex flex-col gap-1 px-1 py-3 text-[11px] uppercase tracking-wide text-[var(--color-brand-gray)] sm:flex-row sm:items-center sm:justify-between">
      <span>Pasantía académica · Gestión financiera y actuarial</span>
      <span>SURA © Todos los derechos reservados</span>
    </footer>
  );
}

/** Numbered section header — a circular blue badge with the section number, replacing the old plain "N · Título" text over a flat gray top border. */
export function Section({ n, title, children }: { n: string; title: string; children: ReactNode }) {
  return (
    <section className="overflow-hidden rounded-[var(--radius-lg)] bg-[var(--color-brand-surface)] shadow-[var(--shadow-sm)] print:shadow-none">
      {/* break-inside-avoid deliberately omitted here — a whole Section (e.g.
          "Teoría necesaria") routinely spans several printed pages, so
          forcing it to avoid breaking just pushes the entire thing to the
          next page and leaves the previous one mostly blank. break-after
          on the header keeps just the badge/title from being orphaned alone
          at the bottom of a page. */}
      <div className="flex items-center gap-3 border-b border-dashed border-[var(--color-brand-gray-light)] bg-[var(--color-brand-blue-light)]/60 px-5 py-3 print:break-after-avoid">
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[var(--color-brand-blue)] font-[family-name:var(--font-condensed)] text-sm font-bold text-white shadow-[var(--shadow-sm)]">
          {n}
        </span>
        <h2 className="font-[family-name:var(--font-condensed)] text-lg font-bold uppercase tracking-wide text-[var(--color-brand-blue-accent)]">{title}</h2>
      </div>
      <div className="flex flex-col gap-3 p-5 text-sm text-[var(--color-foreground)]">{children}</div>
    </section>
  );
}

/** Subsection — a rounded-full "tab" label overlapping a dashed-border card, replacing the old flat left-border strip. The tab icon (flask/bar-chart) doubles as an at-a-glance actuarial-vs-financiero marker. */
export function SubSection({ title, accent, children }: { title: string; accent: "act" | "fin"; children: ReactNode }) {
  const Icon = accent === "act" ? FlaskIcon : BarChartIcon;
  return (
    // break-inside-avoid deliberately omitted — a SubSection's body (prose +
    // lists + embedded tables) routinely runs longer than a page, so forcing
    // it to avoid breaking just displaces the whole block and leaves a gap
    // behind it (see Section above for the same reasoning).
    <div
      className={`relative rounded-[var(--radius-md)] border-2 border-dashed p-4 pt-6 ${
        accent === "act" ? "border-[var(--color-brand-cyan)] bg-[var(--color-brand-cyan-light)]/40" : "border-[var(--color-brand-gray)] bg-[var(--color-brand-blue-light)]/60"
      }`}
    >
      {/* print:static + print:mb-2: on screen this tab overlaps the card's
          top border via absolute positioning, which reads fine because the
          screen never fragments the box. In print, if this SubSection starts
          a fresh page, that overlap sits right at the page boundary and gets
          sliced by it — so for print the tab drops back into normal flow
          (no overlap) instead, guaranteeing it can never render half-off
          the top of a page. */}
      <span className="absolute -top-3 left-3 inline-flex items-center gap-1.5 rounded-full bg-[var(--color-brand-blue)] px-3 py-1 text-xs font-bold uppercase tracking-wide text-white shadow-[var(--shadow-sm)] print:static print:mb-2 print:break-after-avoid">
        <Icon className="h-3.5 w-3.5" />
        {accent === "act" ? "Actuarial" : "Financiero"} — {title}
      </span>
      <div className="flex flex-col gap-2 pt-1 text-sm print:pt-0">{children}</div>
    </div>
  );
}

/** Compact two-column reference block — what the team receives vs. what it must submit that day. Placed before Section 1 so it reads as an executive summary, not a numbered section (keeps every existing "ver sección N" cross-reference in the 4 guides stable). */
export function InsumosEntregables({ insumos, entregables }: { insumos: string[]; entregables: string[] }) {
  return (
    <div className="grid overflow-hidden rounded-[var(--radius-lg)] shadow-[var(--shadow-sm)] sm:grid-cols-2 print:break-inside-avoid print:shadow-none">
      <div className="bg-[var(--color-brand-blue)] p-4">
        <p className="mb-2 inline-block border-b-2 border-[var(--color-brand-yellow)] pb-1 font-[family-name:var(--font-condensed)] text-sm font-bold uppercase tracking-wide text-white">
          Insumos
        </p>
        <ul className="flex flex-col gap-1.5 text-sm text-white/90">
          {insumos.map((item) => (
            <li key={item} className="flex gap-2.5">
              <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--color-brand-yellow)]" />
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
            <li key={item} className="flex gap-2.5">
              <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--color-brand-cyan)]" />
              <span>{item}</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

/** Yellow reflection callout — questions that widen the team's thinking beyond the graded/objective criteria. Never scored, so framed explicitly as optional. Chat-bubble badge overlapping the corner instead of a plain heading. */
export function PreguntasAbiertas({ children }: { children: ReactNode }) {
  return (
    <div className="relative rounded-[var(--radius-lg)] bg-[var(--color-brand-yellow)] px-5 pb-4 pt-6 print:break-inside-avoid">
      {/* print:static + print:translate-y-0: same page-fragmentation fix as
          SubSection's tab — this badge overlaps the box's top edge on
          screen, which would get sliced by a page boundary in print. */}
      <span className="absolute left-4 top-0 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-full bg-[var(--color-brand-blue)] text-white shadow-[var(--shadow-sm)] print:static print:mb-2 print:translate-y-0">
        <ChatIcon className="h-4 w-4" />
      </span>
      <p className="mb-2 font-[family-name:var(--font-condensed)] text-sm font-bold uppercase tracking-wide text-[var(--color-brand-blue)]">
        Preguntas abiertas <span className="font-normal normal-case">— no se califican, son para profundizar en equipo</span>
      </p>
      <ul className="flex flex-col gap-1.5 text-sm text-[var(--color-brand-blue)]">
        {children}
      </ul>
    </div>
  );
}

/** Informational aside — dashed cyan card with an info badge, replacing the plain solid-border cyan box previously copy-pasted (identically) across Días 1-3. Fully children-based: callers keep whatever inline markup (bold lead-ins, lists) they already had. */
export function InfoNote({ children }: { children: ReactNode }) {
  return (
    <div className="flex items-start gap-2.5 rounded-[var(--radius-md)] border border-dashed border-[var(--color-brand-cyan)] bg-[var(--color-brand-cyan-light)] px-3 py-2.5 print:break-inside-avoid">
      <InfoIcon className="mt-0.5 h-4 w-4 shrink-0 text-[var(--color-brand-blue-accent)]" />
      <div className="flex-1">{children}</div>
    </div>
  );
}

/** Notched "flag" callout for hard constraints/rules — the one shape reserved for genuinely non-negotiable statements (a rejected submission, a fixed rule), so it stays rare enough to keep meaning something. Yellow-on-blue keeps the same AA-safe pairing as PreguntasAbiertas; cyan is intentionally never used as a solid text background (see globals.css contrast notes — even brand-blue text on full-strength cyan only reaches ~3.7:1). */
export function FlagCallout({ children }: { children: ReactNode }) {
  return (
    // clip-path set as a class (not inline style) so print:[clip-path:none]
    // can cleanly turn it off — Chromium's print pagination badly mishandles
    // clip-path combined with break-inside-avoid: it was silently displacing
    // this whole box to the very end of the document (after the footer) and
    // corrupting later page-break calculations. Plain rectangle for print.
    <div
      className="flex items-start gap-2 bg-[var(--color-brand-yellow)] py-3 pl-4 pr-10 text-sm font-medium text-[var(--color-brand-blue)] [clip-path:polygon(0_0,94%_0,100%_50%,94%_100%,0_100%)] print:break-inside-avoid print:[clip-path:none] print:pr-4"
    >
      <AlertIcon className="mt-0.5 h-4 w-4 shrink-0" />
      <div>{children}</div>
    </div>
  );
}

/** One step of a numbered, dotted-line-connected process flow — used inside the "Plantillas" section to show the build order at a glance. Pass `last` on the final step to omit its trailing connector. Step titles now sit in a dashed pill instead of plain uppercase text. */
export function FlowStep({ n, title, last, children }: { n: string; title: string; last?: boolean; children: ReactNode }) {
  return (
    <div className="flex gap-3">
      <div className="flex flex-col items-center">
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[var(--color-brand-blue-accent)] font-[family-name:var(--font-condensed)] text-sm font-bold text-white shadow-[var(--shadow-sm)]">
          {n}
        </span>
        {!last && <span className="my-1 w-0 flex-1 border-l-2 border-dotted border-[var(--color-brand-cyan)]" />}
      </div>
      <div className={`flex flex-1 flex-col gap-3 ${last ? "" : "pb-5"}`}>
        <p className="inline-flex w-fit items-center rounded-full border-2 border-dashed border-[var(--color-brand-gray-light)] bg-[var(--color-brand-surface)] px-3 py-1 text-xs font-semibold uppercase tracking-wide text-[var(--color-brand-text-secondary)]">
          {title}
        </p>
        {children}
      </div>
    </div>
  );
}

/** Blank fill-in-the-blank template — same worksheet shape (dashed rules) used everywhere else, rounded wrapper instead of a flat ruled table. */
export function BlankTable({ headers, rows, note }: { headers: string[]; rows: number; note?: string }) {
  return (
    <div className="flex flex-col gap-1">
      <div className={`${tableWrapClass} overflow-x-auto`}>
        <table className={tableClass}>
          <thead>
            <tr>
              {headers.map((h) => (
                <th key={h} className={thClass}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {Array.from({ length: rows }).map((_, i) => (
              <tr key={i}>
                {headers.map((h) => (
                  <td key={h} className={`h-8 ${tdClass}`}>
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

/** Read-only reference table for a dataset's columns — unlike BlankTable, these rows are filled in (a data dictionary), not inputs to complete. */
export function DataDictTable({ rows }: { rows: { col: string; desc: string; rango: string }[] }) {
  return (
    <div className={`${tableWrapClass} overflow-x-auto`}>
      <table className={tableClass}>
        <thead>
          <tr>
            {["Columna", "Descripción", "Valores / rango"].map((h) => (
              <th key={h} className={thClass}>
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.col}>
              <td className={`${tdClass} font-mono`}>{r.col}</td>
              <td className={tdClass}>{r.desc}</td>
              <td className={`${tdClass} text-[var(--color-brand-text-secondary)]`}>{r.rango}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** Two-column term/definition reference table — same read-only pattern as DataDictTable, different shape. */
export function GlossaryTable({ rows }: { rows: { term: string; def: string }[] }) {
  return (
    <div className={`${tableWrapClass} overflow-x-auto`}>
      <table className={tableClass}>
        <thead>
          <tr>
            {["Término", "Definición"].map((h) => (
              <th key={h} className={thClass}>
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.term}>
              <td className={`${tdClass} font-semibold`}>{r.term}</td>
              <td className={tdClass}>{r.def}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** Formula reference notes, one per line with real spacing between them — replaces cramming every formula into one dense paragraph. */
export function FormulaNotes({ lines }: { lines: string[] }) {
  return (
    <div className="flex flex-col gap-2.5 rounded-[var(--radius-md)] border border-dashed border-[var(--color-brand-gray-light)] bg-[var(--color-brand-blue-light)]/40 p-3">
      {lines.map((line, i) => (
        <p key={i} className="text-xs leading-relaxed text-[var(--color-brand-text-secondary)]">
          {line}
        </p>
      ))}
    </div>
  );
}

/** Instrument menu table — identical in Días 1 and 2 (the portfolio decision carries the same 6-instrument menu across both years), so shared instead of copy-pasted. */
export function InstrumentsTable() {
  return (
    <div className={`${tableWrapClass} overflow-x-auto`}>
      <table className={tableClass}>
        <thead>
          <tr>
            {["ID", "Instrumento", "Rendimiento EA", "Volatilidad anual", "Plazo", "Nota"].map((h) => (
              <th key={h} className={thClass}>
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {INSTRUMENTS.map((ins) => (
            <tr key={ins.id}>
              <td className={`${tdClass} font-mono`}>{ins.id}</td>
              <td className={tdClass}>{ins.nombre}</td>
              <td className={tdClass}>{displayYieldLabel(ins)}</td>
              <td className={tdClass}>{(ins.volAnual * 100).toFixed(1)}%</td>
              <td className={tdClass}>{ins.plazoM >= 400 ? "sin venc. fijo" : `${ins.plazoM} meses`}</td>
              <td className={`${tdClass} text-[var(--color-brand-text-secondary)]`}>{ins.nota}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** Covariance matrix, heat-mapped like a spreadsheet: the diagonal (each instrument's own variance) tinted yellow so it reads at a glance as "this is the variance column the volatilities above come from," same idea as the printed guide's simulation-matrix figures. Shared between Días 1 and 2 (same matrix, same table markup, previously duplicated). */
const matrixThClass = "border-b border-r border-dashed border-[var(--color-brand-gray-light)] bg-[var(--color-brand-blue-light)] px-3.5 py-2.5 text-left font-semibold text-[var(--color-brand-blue-accent)] last:border-r-0";
const matrixTdClass = "border-b border-r border-dashed border-[var(--color-brand-gray-light)] px-3.5 py-2.5 last:border-r-0";

export function MatrixTable() {
  return (
    <div className={`${tableWrapClass} overflow-x-auto`}>
      <table className={`${tableClass} border-spacing-0`}>
        <thead>
          <tr>
            <th className={`${matrixThClass} border-r-2`} />
            {INSTRUMENT_IDS.map((id) => (
              <th key={id} className={matrixThClass}>
                {id}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {COVARIANCE_MATRIX.map((row, i) => (
            <tr key={INSTRUMENT_IDS[i]}>
              <td className={`${matrixTdClass} border-r-2 bg-[var(--color-brand-blue-light)] font-mono font-semibold text-[var(--color-brand-blue-accent)]`}>{INSTRUMENT_IDS[i]}</td>
              {row.map((v, j) => (
                <td
                  key={INSTRUMENT_IDS[j]}
                  className={`${matrixTdClass} text-[var(--color-brand-text-secondary)] ${i === j ? "bg-[var(--color-brand-yellow)]/25 font-semibold" : ""}`}
                >
                  {v.toFixed(6)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
