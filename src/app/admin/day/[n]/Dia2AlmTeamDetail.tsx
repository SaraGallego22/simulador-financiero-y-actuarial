"use client";

import { useState } from "react";
import type { FinancialScore, AlmSimRow, AlmRealYearResult } from "@/domain/finance/alm";
import type { MonthlyAllocationEntry } from "@/domain/finance/instruments";
import { AlmScoreTiles, AlmLadderTable, AlmPortfolioTable, AlmPnlBreakdown, PortfolioScheduleView } from "@/components/AlmLadderTable";

export interface Dia2AlmTeamOption {
  id: string;
  name: string;
  color: string;
  almScore: FinancialScore | null;
  ladderRows: AlmSimRow[] | null;
  schedule: MonthlyAllocationEntry[] | null;
  realAlmYear: AlmRealYearResult | undefined;
}

/**
 * Día 2's ALM calce detail (portafolio vs. reservas de Año 1) as a
 * single-team dropdown — same pattern as Dia2TeamDetail/
 * Dia2ReportesTeamDetail, replacing the accordion-per-team list that used
 * to live under "Resultados objetivos" (now merged into "Top del día" for
 * everything except this section, moved here instead).
 */
export function Dia2AlmTeamDetail({ teams }: { teams: Dia2AlmTeamOption[] }) {
  const [selectedId, setSelectedId] = useState(teams[0]?.id ?? "");
  const selected = teams.find((t) => t.id === selectedId) ?? teams[0];
  if (!selected) return null;

  return (
    <div className="rounded-[var(--radius-lg)] border border-[var(--color-brand-gray-light)] bg-[var(--color-brand-surface)] shadow-[var(--shadow-sm)] p-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <h3 className="font-[family-name:var(--font-condensed)] text-sm font-bold uppercase tracking-wide text-[var(--color-brand-blue-accent)]">
          ALM — calce del portafolio vs. reservas de Año 1
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

      {!selected.almScore ? (
        <p className="text-sm text-[var(--color-brand-text-secondary)]">Sin portafolio o sin reservas aún para este equipo.</p>
      ) : (
        <div>
          <div className="mb-3">
            <AlmScoreTiles score={selected.almScore} />
          </div>

          <div className="mb-3">
            <p className="mb-1 text-xs font-semibold uppercase text-[var(--color-brand-text-secondary)]">Calendario de decisión de inversión</p>
            {selected.schedule ? (
              <PortfolioScheduleView schedule={selected.schedule} />
            ) : (
              <p className="text-xs text-[var(--color-brand-text-secondary)]">—</p>
            )}
          </div>

          {selected.ladderRows && <AlmLadderTable rows={selected.ladderRows} />}
          {selected.ladderRows && (
            <div className="mt-3">
              <AlmPortfolioTable rows={selected.ladderRows} />
            </div>
          )}

          {selected.realAlmYear && (
            <div className="mt-4 border-t border-[var(--color-brand-gray-light)] pt-3">
              <p className="mb-2 text-xs font-semibold uppercase text-[var(--color-brand-text-secondary)]">
                ALM real — con la prima real de este equipo, solo los 12 meses de Año 1 (esto es lo que finBench usa para el Resultado de
                Inversiones/Balance/Solvencia reales; el ALM ficticio de arriba solo califica la nota de ALM de este día)
              </p>
              <div className="flex flex-col gap-3">
                <AlmPnlBreakdown scoreFicticio={selected.almScore} realYear={selected.realAlmYear} year={1} />
                <AlmLadderTable rows={selected.realAlmYear.rows} />
                <AlmPortfolioTable rows={selected.realAlmYear.rows} />
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
