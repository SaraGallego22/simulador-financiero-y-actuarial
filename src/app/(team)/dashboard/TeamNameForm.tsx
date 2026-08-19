"use client";

import { useActionState, useState } from "react";
import { updateTeamNameAction, type UpdateTeamNameState } from "@/lib/teamActions";

export function TeamNameForm({ currentName }: { currentName: string }) {
  const [editing, setEditing] = useState(false);
  const [state, formAction, pending] = useActionState<UpdateTeamNameState, FormData>(async (_prev, formData) => {
    const result = await updateTeamNameAction(_prev, formData);
    if (result.success) setEditing(false);
    return result;
  }, {});

  if (!editing) {
    return (
      <button
        type="button"
        onClick={() => setEditing(true)}
        className="mt-1 text-xs font-medium text-[var(--color-brand-cyan)] underline hover:opacity-80"
      >
        Cambiar nombre del equipo
      </button>
    );
  }

  return (
    <form action={formAction} className="mt-2 flex flex-wrap items-center gap-2">
      <input
        name="name"
        defaultValue={currentName}
        maxLength={60}
        required
        autoFocus
        className="rounded border border-[var(--color-brand-gray-light)] px-3 py-1.5 text-sm focus:border-[var(--color-brand-cyan)] focus:outline-none"
      />
      <button
        type="submit"
        disabled={pending}
        className="rounded-full bg-[var(--color-brand-blue)] px-3 py-1.5 text-xs font-medium text-white shadow-[var(--shadow-sm)] transition-all hover:-translate-y-0.5 hover:brightness-110 active:translate-y-0 disabled:opacity-50"
      >
        {pending ? "Guardando…" : "Guardar"}
      </button>
      <button
        type="button"
        onClick={() => setEditing(false)}
        className="text-xs text-[var(--color-brand-text-secondary)] underline hover:opacity-80"
      >
        Cancelar
      </button>
      {state.error && <span className="w-full text-xs text-[var(--color-brand-red)]">{state.error}</span>}
    </form>
  );
}
