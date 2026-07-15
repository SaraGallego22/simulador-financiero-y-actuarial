"use client";

import { submitMemberEvaluationAction } from "@/lib/adminActions";

export interface MemberEvaluationInitial {
  notaGeneral: number | null;
  aprobado: boolean | null;
  perfil: "ACTUARIAL" | "FINANCIERO" | "GENERALISTA" | null;
}

/** Subjective grading is person-level only, Días 2-4 only (see MemberDayEvaluation's doc comment). */
export function MemberEvaluationForm({
  id,
  day,
  initial,
}: {
  id: string;
  day: number;
  initial: MemberEvaluationInitial;
}) {
  const action = submitMemberEvaluationAction.bind(null, id, day);

  return (
    <form action={action} className="flex flex-col gap-2 rounded border border-[var(--color-brand-gray-light)] p-3 sm:flex-row sm:flex-wrap sm:items-end sm:gap-3">
      <label className="flex flex-col gap-1 text-xs text-[var(--color-brand-text-secondary)]">
        Nota general (1-5)
        <input
          type="number"
          step="0.1"
          min="1"
          max="5"
          name="notaGeneral"
          defaultValue={initial.notaGeneral ?? ""}
          className="w-20 rounded border border-[var(--color-brand-gray-light)] px-2 py-1 text-sm"
        />
      </label>

      <label className="flex flex-col gap-1 text-xs text-[var(--color-brand-text-secondary)]">
        ¿Aprobó el día?
        <select
          name="aprobado"
          defaultValue={initial.aprobado == null ? "" : String(initial.aprobado)}
          className="w-28 rounded border border-[var(--color-brand-gray-light)] px-2 py-1 text-sm"
        >
          <option value="">Sin definir</option>
          <option value="true">Sí</option>
          <option value="false">No</option>
        </select>
      </label>

      <label className="flex flex-col gap-1 text-xs text-[var(--color-brand-text-secondary)]">
        Perfil
        <select
          name="perfil"
          defaultValue={initial.perfil ?? ""}
          className="w-32 rounded border border-[var(--color-brand-gray-light)] px-2 py-1 text-sm"
        >
          <option value="">Sin definir</option>
          <option value="ACTUARIAL">Actuarial</option>
          <option value="FINANCIERO">Financiero</option>
          <option value="GENERALISTA">Generalista</option>
        </select>
      </label>

      <button
        type="submit"
        className="rounded bg-[var(--color-brand-blue)] px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-[var(--color-brand-blue-dark)]"
      >
        Guardar
      </button>
    </form>
  );
}
