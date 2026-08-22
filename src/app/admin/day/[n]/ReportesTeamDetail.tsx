"use client";

import { useState } from "react";
import { GROUP_LABELS } from "@/domain/grading/concepts";
import type { ConceptGroup } from "@/domain/grading/concepts";

interface ReportRow {
  id: string;
  label: string;
  unit: "COP" | "score" | "x";
  val: number | null;
  bench: number | null;
  score: number | null;
}

export interface ReportesTeamOption {
  id: string;
  name: string;
  color: string;
  avgScore: number | null;
  groups: { group: ConceptGroup; rows: ReportRow[] }[];
  ungrouped: ReportRow[];
}

/** Clave de la sección que agrupa las líneas sin `group` propio — Día 4 las tiene todas así, sin encabezado propio (ver `sections` más abajo). */
const UNGROUPED_KEY = "__otros";

const fmt = (v: number | null, unit: string) =>
  v == null ? "—" : unit === "COP" ? `$${Math.round(v / 1e6).toLocaleString("es-CO")} M` : unit === "x" ? `${v.toFixed(2)}×` : v.toFixed(1);

const averageScore = (rows: ReportRow[]) => {
  const scored = rows.filter((r) => r.score != null);
  return scored.length > 0 ? scored.reduce((s, r) => s + r.score!, 0) / scored.length : null;
};

/** `divider` separa la tabla del encabezado del estado; sin encabezado sobra, si no dobla el borde del contenedor. */
function StatementTable({ rows, divider }: { rows: ReportRow[]; divider: boolean }) {
  return (
    <table className={`w-full text-sm ${divider ? "border-t border-[var(--color-brand-gray-light)]" : ""}`}>
      <thead>
        <tr className="text-left text-xs uppercase tracking-wide text-[var(--color-brand-text-secondary)]">
          <th className="px-4 py-2">Concepto</th>
          <th className="px-4 py-2">Reportado</th>
          <th className="px-4 py-2">Motor</th>
          <th className="px-4 py-2">Nota</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => (
          <tr key={r.id} className="border-t border-[var(--color-brand-gray-light)]">
            <td className="px-4 py-2">{r.label}</td>
            <td className="px-4 py-2">{fmt(r.val, r.unit)}</td>
            <td className="px-4 py-2">{fmt(r.bench, r.unit)}</td>
            <td className="px-4 py-2">{r.score != null ? r.score.toFixed(0) : "—"}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/**
 * "Reportes numéricos" as a single-team dropdown, same
 * ship-everything-precomputed-down pattern as Dia2TeamDetail (see
 * Dia1TeamDetail's doc comment for why). Used by every day that has
 * "reporte" concepts (Días 2-4).
 *
 * A second dropdown picks one statement at a time, and only appears when
 * the day actually has more than one: Día 3 submits 66 líneas across five
 * estados (P&G 2028/2029 + Balance de los tres años), so stacking them all
 * meant scrolling past four to reach the fifth. Días 2 y 4 tienen un solo
 * bloque y se ven igual que antes.
 */
export function ReportesTeamDetail({ day, teams }: { day: number; teams: ReportesTeamOption[] }) {
  const [selectedId, setSelectedId] = useState(teams[0]?.id ?? "");
  // Las secciones son las mismas para todos los equipos (son los conceptos
  // del día), así que la sección elegida sobrevive al cambio de equipo.
  const [selectedSection, setSelectedSection] = useState<string>(teams[0]?.groups[0]?.group ?? UNGROUPED_KEY);
  const selected = teams.find((t) => t.id === selectedId) ?? teams[0];
  if (!selected) return null;

  // Sin encabezado propio: todo concepto "reporte" sin `group` (Día 4) es el
  // único bloque de ese día, nunca conviven con líneas agrupadas — no hace
  // falta distinguirlas con un título tipo "Otras líneas".
  const sections: { key: string; label: string | null; rows: ReportRow[] }[] = [
    ...selected.groups.map(({ group, rows }) => ({ key: group as string, label: GROUP_LABELS[group], rows })),
    ...(selected.ungrouped.length > 0 ? [{ key: UNGROUPED_KEY, label: null, rows: selected.ungrouped }] : []),
  ];
  const section = sections.find((s) => s.key === selectedSection) ?? sections[0];
  const sectionScore = section ? averageScore(section.rows) : null;

  return (
    <div className="rounded-[var(--radius-lg)] border border-[var(--color-brand-gray-light)] bg-[var(--color-brand-surface)] shadow-[var(--shadow-sm)] p-4">
      <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
        <h3 className="font-[family-name:var(--font-condensed)] text-sm font-bold uppercase tracking-wide text-[var(--color-brand-blue-accent)]">
          Reportes numéricos — Día {day}
        </h3>
        <div className="flex flex-wrap items-end gap-3">
          {sections.length > 1 && (
            <label className="flex flex-col gap-1 text-xs font-semibold uppercase tracking-wide text-[var(--color-brand-text-secondary)]">
              Reporte
              <select
                value={section?.key ?? ""}
                onChange={(e) => setSelectedSection(e.target.value)}
                className="min-w-64 rounded border border-[var(--color-brand-gray-light)] bg-[var(--color-brand-surface)] px-3 py-2 text-sm font-semibold text-[var(--color-foreground)]"
              >
                {sections.map((s) => (
                  <option key={s.key} value={s.key}>
                    {s.label}
                  </option>
                ))}
              </select>
            </label>
          )}
          <label className="flex flex-col gap-1 text-xs font-semibold uppercase tracking-wide text-[var(--color-brand-text-secondary)]">
            Equipo
            <select
              value={selected.id}
              onChange={(e) => setSelectedId(e.target.value)}
              className="min-w-56 rounded border border-[var(--color-brand-gray-light)] bg-[var(--color-brand-surface)] px-3 py-2 text-sm font-semibold text-[var(--color-foreground)]"
            >
              {teams.map((t) => (
                <option key={t.id} value={t.id} style={{ color: t.color }}>
                  {t.name}
                </option>
              ))}
            </select>
          </label>
        </div>
      </div>

      <p className="mb-2 text-sm font-semibold text-[var(--color-brand-blue-accent)]">
        {sections.length > 1
          ? `${sectionScore != null ? `Nota de este reporte: ${sectionScore.toFixed(0)}` : "Este reporte no tiene líneas calificables aún"} · ${
              selected.avgScore != null ? `Nota promedio del día: ${selected.avgScore.toFixed(0)}` : "Día sin reportes calificables aún"
            }`
          : selected.avgScore != null
            ? `Nota promedio: ${selected.avgScore.toFixed(0)}`
            : "Sin reportes calificables aún"}
      </p>
      <p className="mb-3 text-[15px] italic text-[var(--color-brand-text-secondary)]">Cifras en millones de pesos.</p>

      {section && (
        <div className="overflow-hidden rounded border border-[var(--color-brand-gray-light)]">
          {section.label && (
            <p className="bg-[var(--color-brand-blue-light)] px-3 py-1.5 text-xs font-semibold uppercase tracking-wide text-[var(--color-brand-blue-accent)]">
              {section.label}
            </p>
          )}
          <StatementTable rows={section.rows} divider={section.label != null} />
        </div>
      )}
    </div>
  );
}
