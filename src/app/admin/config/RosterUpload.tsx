"use client";

import { useActionState } from "react";
import { uploadRosterAction, type UploadRosterState } from "@/lib/adminActions";

export function RosterUpload() {
  const [state, formAction, pending] = useActionState<UploadRosterState, FormData>(uploadRosterAction, {});

  return (
    <div className="rounded-lg border border-[var(--color-brand-gray-light)] bg-white p-5">
      <h3 className="mb-2 text-sm font-semibold text-gray-700">Roster de integrantes</h3>
      <p className="mb-3 text-sm text-gray-600">
        Sube un CSV con columnas <code>nombre,equipo</code> para habilitar la calificación subjetiva por integrante
        (además de la calificación por equipo).
      </p>
      <form action={formAction} className="flex items-center gap-3">
        <input type="file" name="file" accept=".csv" required disabled={pending} className="text-sm" />
        <button
          type="submit"
          disabled={pending}
          className="rounded bg-[var(--color-brand-blue)] px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-[var(--color-brand-blue-dark)] disabled:opacity-50"
        >
          {pending ? "Subiendo…" : "Subir"}
        </button>
      </form>
      {state.error && <p className="mt-2 text-sm text-red-600">{state.error}</p>}
      {state.success && <p className="mt-2 text-sm text-green-700">{state.success}</p>}
    </div>
  );
}
