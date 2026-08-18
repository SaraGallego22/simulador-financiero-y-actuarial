import { GROUP_LABELS } from "@/domain/grading/concepts";
import type { ConceptGroup } from "@/domain/grading/concepts";
import type { ConceptoSummary } from "./DeliverablesForm";

const EMPHASIZED_ID_SUFFIXES = ["_rt", "_uai", "_uneta", "_activos", "_pasivoPatrim"];
function isEmphasized(id: string): boolean {
  return EMPHASIZED_ID_SUFFIXES.some((suffix) => id.endsWith(suffix));
}

function formatValue(value: number | undefined, unit: ConceptoSummary["unit"]): string {
  if (value == null) return "—";
  if (unit === "COP") return value.toLocaleString("es-CO", { maximumFractionDigits: 0 });
  if (unit === "x") return `${value.toFixed(2)}x`;
  return value.toFixed(0);
}

/** Read-only rendering of a past day's own DeliverablesForm submission — same grouping/emphasis as the editable form, no input/submit. Used on Día 3 to show the team's own Día 2 P&G/Balance lines as reference. */
export function DeliverablesReadOnly({ day, concepts, values }: { day: number; concepts: ConceptoSummary[]; values: Record<string, number> }) {
  if (concepts.length === 0) return null;

  const grouped = new Map<ConceptGroup, ConceptoSummary[]>();
  const ungrouped: ConceptoSummary[] = [];
  for (const c of concepts) {
    if (c.group) {
      if (!grouped.has(c.group)) grouped.set(c.group, []);
      grouped.get(c.group)!.push(c);
    } else {
      ungrouped.push(c);
    }
  }

  return (
    <div className="rounded-[var(--radius-lg)] border border-[var(--color-brand-gray-light)] bg-[var(--color-brand-surface)] p-5">
      <h3 className="mb-2 font-[family-name:var(--font-condensed)] text-sm font-bold uppercase tracking-wide text-[var(--color-brand-blue-accent)]">
        Reporte financiero/actuarial — Día {day}
      </h3>

      <div className="flex flex-col gap-5">
        {[...grouped.entries()].map(([group, groupConcepts]) => (
          <div key={group} className="overflow-hidden rounded border border-[var(--color-brand-gray-light)]">
            <p className="bg-[var(--color-brand-blue-light)] px-3 py-1.5 text-xs font-semibold uppercase tracking-wide text-[var(--color-brand-blue-accent)]">
              {GROUP_LABELS[group]}
            </p>
            <div>
              {groupConcepts.map((c) => (
                <div
                  key={c.id}
                  className={`flex items-center justify-between gap-3 border-t border-[var(--color-brand-gray-light)] px-3 py-1.5 text-sm ${isEmphasized(c.id) ? "font-semibold" : ""}`}
                >
                  <span className="text-[var(--color-foreground)]">{c.label}</span>
                  <span className="text-[var(--color-brand-text-secondary)]">{formatValue(values[c.id], c.unit)}</span>
                </div>
              ))}
            </div>
          </div>
        ))}

        {ungrouped.length > 0 && (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {ungrouped.map((c) => (
              <div key={c.id} className="flex flex-col gap-1 text-xs text-[var(--color-brand-text-secondary)]">
                {c.label} {c.unit === "COP" ? "($)" : c.unit === "x" ? "(veces)" : ""}
                <span className="text-sm text-[var(--color-foreground)]">{formatValue(values[c.id], c.unit)}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
