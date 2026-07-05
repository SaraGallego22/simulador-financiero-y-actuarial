"use client";

import { useActionState, useState } from "react";
import { createTeamAction } from "@/lib/adminActions";

interface FormState {
  error?: string;
  success?: { username: string; password: string };
}

function randomPassword(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(9));
  return btoa(String.fromCharCode(...bytes))
    .replace(/[+/=]/g, "")
    .slice(0, 12);
}

export function CreateTeamForm() {
  const [password, setPassword] = useState("");
  const [state, formAction, pending] = useActionState<FormState, FormData>(async (_prev, formData) => {
    const result = await createTeamAction(formData);
    if (result.error) return { error: result.error };
    return {
      success: { username: String(formData.get("username")), password: String(formData.get("password")) },
    };
  }, {});

  return (
    <form action={formAction} className="flex flex-col gap-3 rounded border border-dashed border-gray-300 p-4">
      <h3 className="text-sm font-semibold text-gray-700">Crear cuenta de equipo</h3>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <input
          name="name"
          placeholder="Nombre del equipo"
          required
          className="rounded border border-gray-300 px-3 py-2 text-sm focus:border-[var(--color-brand-cyan)] focus:outline-none"
        />
        <input
          name="username"
          placeholder="Usuario"
          required
          className="rounded border border-gray-300 px-3 py-2 text-sm focus:border-[var(--color-brand-cyan)] focus:outline-none"
        />
        <div className="flex gap-2">
          <input
            name="password"
            placeholder="Contraseña (min. 8)"
            required
            minLength={8}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full rounded border border-gray-300 px-3 py-2 text-sm focus:border-[var(--color-brand-cyan)] focus:outline-none"
          />
          <button
            type="button"
            onClick={() => setPassword(randomPassword())}
            className="whitespace-nowrap rounded border border-gray-300 px-2 text-xs text-gray-600 hover:bg-gray-50"
          >
            Generar
          </button>
        </div>
      </div>

      {state.error && <p className="text-sm text-red-600">{state.error}</p>}
      {state.success && (
        <p className="rounded bg-green-50 px-3 py-2 text-sm text-green-700">
          Cuenta creada: <strong>{state.success.username}</strong> / <strong>{state.success.password}</strong> —
          cópiala, no se vuelve a mostrar.
        </p>
      )}

      <button
        type="submit"
        disabled={pending}
        className="w-fit rounded bg-[var(--color-brand-blue)] px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-[var(--color-brand-blue-dark)] disabled:opacity-50"
      >
        {pending ? "Creando…" : "Crear equipo"}
      </button>
    </form>
  );
}
