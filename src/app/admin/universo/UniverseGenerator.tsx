"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export interface UniverseRunSummary {
  id: string;
  seed: number;
  rowCount: number;
  status: "PENDING" | "RUNNING" | "DONE" | "FAILED";
  error: string | null;
  createdAt: string;
}

function StatusBadge({ status }: { status: UniverseRunSummary["status"] | "NONE" }) {
  const styles: Record<string, string> = {
    NONE: "bg-gray-100 text-gray-500",
    PENDING: "bg-gray-100 text-gray-500",
    RUNNING: "bg-[var(--color-brand-cyan-light)] text-[#005a6e]",
    DONE: "bg-green-100 text-green-700",
    FAILED: "bg-red-100 text-red-700",
  };
  const labels: Record<string, string> = {
    NONE: "Sin generar",
    PENDING: "Pendiente",
    RUNNING: "Generando…",
    DONE: "Listo",
    FAILED: "Falló",
  };
  return (
    <span className={`rounded-full px-3 py-1 text-xs font-semibold ${styles[status]}`}>{labels[status]}</span>
  );
}

function DatasetCard({
  title,
  description,
  latest,
  onGenerate,
  loading,
  downloadHref,
}: {
  title: string;
  description: string;
  latest: UniverseRunSummary | null;
  onGenerate: () => void;
  loading: boolean;
  downloadHref?: string;
}) {
  return (
    <div className="rounded-lg border border-[var(--color-brand-gray-light)] border-t-4 border-t-[var(--color-brand-blue)] bg-white p-5">
      <div className="mb-2 flex items-center justify-between">
        <h2 className="font-[family-name:var(--font-condensed)] text-sm font-bold uppercase tracking-wide text-[var(--color-brand-blue)]">
          {title}
        </h2>
        <StatusBadge status={latest?.status ?? "NONE"} />
      </div>
      <p className="mb-3 text-sm text-gray-600">{description}</p>
      {latest && (
        <p className="mb-3 text-xs text-gray-500">
          Última corrida: semilla {latest.seed}, {latest.rowCount.toLocaleString("es-CO")} filas
          {latest.status === "FAILED" && latest.error ? ` — ${latest.error}` : ""}
        </p>
      )}
      <div className="flex gap-2">
        <button
          onClick={onGenerate}
          disabled={loading}
          className="rounded bg-[var(--color-brand-blue)] px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-[var(--color-brand-blue-dark)] disabled:opacity-50"
        >
          {loading ? "Generando…" : latest ? "Regenerar" : "Generar"}
        </button>
        {downloadHref && latest?.status === "DONE" && (
          <a
            href={downloadHref}
            className="rounded border border-[var(--color-brand-blue)] px-4 py-2 text-sm font-medium text-[var(--color-brand-blue)] hover:bg-[var(--color-brand-blue-light)]"
          >
            Descargar CSV
          </a>
        )}
      </div>
    </div>
  );
}

export function UniverseGenerator({
  initialColombia,
  initialChile,
}: {
  initialColombia: UniverseRunSummary | null;
  initialChile: UniverseRunSummary | null;
}) {
  const router = useRouter();
  const [seed, setSeed] = useState(42);
  const [loadingKind, setLoadingKind] = useState<"colombia" | "chile" | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function generate(kind: "colombia" | "chile") {
    setLoadingKind(kind);
    setError(null);
    try {
      const res = await fetch("/api/universe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind, seed }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error(body?.error ?? "Error desconocido");
      }
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoadingKind(null);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-3">
        <label htmlFor="seed" className="text-sm font-medium text-gray-700">
          Semilla
        </label>
        <input
          id="seed"
          type="number"
          value={seed}
          onChange={(e) => setSeed(Number(e.target.value))}
          className="w-32 rounded border border-gray-300 px-3 py-1.5 text-sm focus:border-[var(--color-brand-cyan)] focus:outline-none"
        />
        <span className="text-xs text-gray-500">La misma semilla siempre genera el mismo universo.</span>
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}

      <DatasetCard
        title="Universo Colombia"
        description="1,000,000 de pólizas sintéticas de auto, con riesgo y siniestros calculados con el modelo de frecuencia/severidad."
        latest={initialColombia}
        onGenerate={() => generate("colombia")}
        loading={loadingKind === "colombia"}
        downloadHref="/api/universe/public-csv"
      />
      <DatasetCard
        title="Dataset Chile"
        description="100,000 pólizas de referencia con 3 años de exposición (2021-2023), usadas para calibrar el portafolio de inversión."
        latest={initialChile}
        onGenerate={() => generate("chile")}
        loading={loadingKind === "chile"}
      />
    </div>
  );
}
