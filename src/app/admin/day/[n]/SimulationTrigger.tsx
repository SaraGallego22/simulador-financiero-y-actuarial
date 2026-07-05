"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function SimulationTrigger({ day, defaultCuotaPct }: { day: number; defaultCuotaPct: number }) {
  const router = useRouter();
  const [seed, setSeed] = useState(42);
  const [beta, setBeta] = useState(1.5);
  const [marcaScale, setMarcaScale] = useState(0.3);
  const [cuotaPct, setCuotaPct] = useState(defaultCuotaPct);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/simulation", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ day, seed, beta, marcaScale, cuotaPct }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error(body?.error ?? "Error desconocido");
      }
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="rounded-lg border border-[var(--color-brand-gray-light)] border-t-4 border-t-[var(--color-brand-cyan)] bg-white p-5">
      <h3 className="mb-3 font-[family-name:var(--font-condensed)] text-sm font-bold uppercase tracking-wide text-[var(--color-brand-blue)]">
        Simulación de mercado
      </h3>
      <div className="mb-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <label className="flex flex-col gap-1 text-xs text-gray-600">
          Semilla
          <input type="number" value={seed} onChange={(e) => setSeed(Number(e.target.value))} className="rounded border border-gray-300 px-2 py-1 text-sm" />
        </label>
        <label className="flex flex-col gap-1 text-xs text-gray-600">
          Sensibilidad al precio (β)
          <input type="number" step="0.1" value={beta} onChange={(e) => setBeta(Number(e.target.value))} className="rounded border border-gray-300 px-2 py-1 text-sm" />
        </label>
        <label className="flex flex-col gap-1 text-xs text-gray-600">
          Inercia de marca
          <input type="number" step="0.05" value={marcaScale} onChange={(e) => setMarcaScale(Number(e.target.value))} className="rounded border border-gray-300 px-2 py-1 text-sm" />
        </label>
        <label className="flex flex-col gap-1 text-xs text-gray-600">
          Cuota máx. por equipo
          <input
            type="number"
            step="0.05"
            min="0"
            max="1"
            value={cuotaPct}
            onChange={(e) => setCuotaPct(Number(e.target.value))}
            className="rounded border border-gray-300 px-2 py-1 text-sm"
          />
        </label>
      </div>
      {error && <p className="mb-3 text-sm text-red-600">{error}</p>}
      <button
        onClick={run}
        disabled={loading}
        className="rounded bg-[var(--color-brand-blue)] px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-[var(--color-brand-blue-dark)] disabled:opacity-50"
      >
        {loading ? "Corriendo…" : "Correr simulación"}
      </button>
    </div>
  );
}
