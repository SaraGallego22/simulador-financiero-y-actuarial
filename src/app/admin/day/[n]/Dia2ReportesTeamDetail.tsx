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

export interface Dia2ReportesTeamOption {
  id: string;
  name: string;
  color: string;
  avgScore: number | null;
  groups: { group: ConceptGroup; rows: ReportRow[] }[];
  ungrouped: ReportRow[];
}

const fmt = (v: number | null, unit: string) =>
  v == null ? "—" : unit === "COP" ? `$${Math.round(v).toLocaleString("es-CO")}` : unit === "x" ? `${v.toFixed(2)}×` : v.toFixed(1);

function StatementTable({ rows }: { rows: ReportRow[] }) {
  return (
    <table className="w-full border-t border-[var(--color-brand-gray-light)] text-sm">
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
 * Día 2's "Reportes numéricos" as a single-team dropdown, same
 * ship-everything-precomputed-down pattern as Dia2TeamDetail (see
 * Dia1TeamDetail's doc comment for why) — replaces the accordion-per-team
 * list Días 3-4 still use in their own "Entregables" tab.
 */
export function Dia2ReportesTeamDetail({ teams }: { teams: Dia2ReportesTeamOption[] }) {
  const [selectedId, setSelectedId] = useState(teams[0]?.id ?? "");
  const selected = teams.find((t) => t.id === selectedId) ?? teams[0];
  if (!selected) return null;

  return (
    <div className="rounded-[var(--radius-lg)] border border-[var(--color-brand-gray-light)] bg-[var(--color-brand-surface)] shadow-[var(--shadow-sm)] p-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <h3 className="font-[family-name:var(--font-condensed)] text-sm font-bold uppercase tracking-wide text-[var(--color-brand-blue-accent)]">
          Reportes numéricos — Día 2
        </h3>
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

      <p className="mb-2 text-sm font-semibold text-[var(--color-brand-blue-accent)]">
        {selected.avgScore != null ? `Nota promedio: ${selected.avgScore.toFixed(0)}` : "Sin reportes calificables aún"}
      </p>

      <div className="flex flex-col gap-3">
        {selected.groups.map(({ group, rows }) => (
          <div key={group} className="overflow-hidden rounded border border-[var(--color-brand-gray-light)]">
            <p className="bg-[var(--color-brand-blue-light)] px-3 py-1.5 text-xs font-semibold uppercase tracking-wide text-[var(--color-brand-blue-accent)]">
              {GROUP_LABELS[group]}
            </p>
            <StatementTable rows={rows} />
          </div>
        ))}
        {selected.ungrouped.length > 0 && <StatementTable rows={selected.ungrouped} />}
      </div>
    </div>
  );
}
