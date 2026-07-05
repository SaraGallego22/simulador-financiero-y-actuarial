"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function SimulationTrigger({ day, defaultCuotaPercent }: { day: number; defaultCuotaPercent: number }) {
  const router = useRouter();
  const [seed, setSeed] = useState(42);
  const [beta, setBeta] = useState(1.5);
  const [marcaScale, setMarcaScale] = useState(0.3);
  const [cuotaPercent, setCuotaPercent] = useState(defaultCuotaPercent);
  const [retentionFactor, setRetentionFactor] = useState(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/simulation", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ day, seed, beta, marcaScale, cuotaPct: cuotaPercent / 100, retentionFactor }),
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
    <div className="rounded-lg border border-[var(--color-brand-gray-light)] border-t-4 border-t-[var(--color-brand-cyan)] bg-[var(--color-brand-surface)] p-5">
      <h3 className="mb-3 font-[family-name:var(--font-condensed)] text-sm font-bold uppercase tracking-wide text-[var(--color-brand-blue-accent)]">
        Simulación de mercado
      </h3>
      <div className="mb-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <label className="flex flex-col gap-1 text-xs text-[var(--color-brand-text-secondary)]">
          Semilla
          <input type="number" value={seed} onChange={(e) => setSeed(Number(e.target.value))} className="rounded border border-[var(--color-brand-gray-light)] px-2 py-1 text-sm" />
        </label>
        <label className="flex flex-col gap-1 text-xs text-[var(--color-brand-text-secondary)]">
          Sensibilidad al precio (β)
          <input type="number" step="0.1" value={beta} onChange={(e) => setBeta(Number(e.target.value))} className="rounded border border-[var(--color-brand-gray-light)] px-2 py-1 text-sm" />
        </label>
        <label className="flex flex-col gap-1 text-xs text-[var(--color-brand-text-secondary)]">
          Inercia de marca
          <input type="number" step="0.05" value={marcaScale} onChange={(e) => setMarcaScale(Number(e.target.value))} className="rounded border border-[var(--color-brand-gray-light)] px-2 py-1 text-sm" />
        </label>
        <label className="flex flex-col gap-1 text-xs text-[var(--color-brand-text-secondary)]">
          Cuota máx. por equipo (%)
          <input
            type="number"
            step="5"
            min="1"
            max="100"
            value={cuotaPercent}
            onChange={(e) => setCuotaPercent(Number(e.target.value))}
            className="rounded border border-[var(--color-brand-gray-light)] px-2 py-1 text-sm"
          />
        </label>
        {day === 2 && (
          <label className="flex flex-col gap-1 text-xs text-[var(--color-brand-text-secondary)]">
            Retención de clientes (Año 1→2)
            <input
              type="number"
              step="0.5"
              min="0"
              value={retentionFactor}
              onChange={(e) => setRetentionFactor(Number(e.target.value))}
              className="rounded border border-[var(--color-brand-gray-light)] px-2 py-1 text-sm"
            />
          </label>
        )}
      </div>
      <p className="mb-3 text-xs text-[var(--color-brand-text-secondary)]">
        Porcentaje máximo del universo (1,000,000 de pólizas) que cada equipo puede quedarse. Con 1 equipo con tarifa
        completa, ese equipo recibe el 100% automáticamente (no hay competencia que simular).
        {day === 2 && " La retención controla qué tan difícil es para un equipo perder un cliente que ya tenía en el Año 1."}
      </p>
      {error && <p className="mb-3 text-sm text-[var(--color-brand-red)]">{error}</p>}
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
