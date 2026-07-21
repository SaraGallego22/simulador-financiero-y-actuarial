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
    NONE: "bg-[var(--color-brand-gray-light)] text-[var(--color-brand-text-secondary)]",
    PENDING: "bg-[var(--color-brand-gray-light)] text-[var(--color-brand-text-secondary)]",
    RUNNING: "bg-[var(--color-brand-cyan)]/15 text-[var(--color-brand-cyan)]",
    DONE: "bg-[var(--color-brand-green)]/15 text-[var(--color-brand-green)]",
    FAILED: "bg-[var(--color-brand-red)]/15 text-[var(--color-brand-red)]",
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
    <div className="rounded-lg border border-[var(--color-brand-gray-light)] border-t-4 border-t-[var(--color-brand-blue-accent)] bg-[var(--color-brand-surface)] p-5">
      <div className="mb-2 flex items-center justify-between">
        <h2 className="font-[family-name:var(--font-condensed)] text-sm font-bold uppercase tracking-wide text-[var(--color-brand-blue-accent)]">
          {title}
        </h2>
        <StatusBadge status={latest?.status ?? "NONE"} />
      </div>
      <p className="mb-3 text-sm text-[var(--color-brand-text-secondary)]">{description}</p>
      {latest && (
        <p className="mb-3 text-xs text-[var(--color-brand-text-secondary)]">
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
            className="rounded border border-[var(--color-brand-blue-accent)] px-4 py-2 text-sm font-medium text-[var(--color-brand-blue-accent)] hover:bg-[var(--color-brand-blue-light)]"
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
        <label htmlFor="seed" className="text-sm font-medium text-[var(--color-foreground)]">
          Semilla
        </label>
        <input
          id="seed"
          type="number"
          value={seed}
          onChange={(e) => setSeed(Number(e.target.value))}
          className="w-32 rounded border border-[var(--color-brand-gray-light)] px-3 py-1.5 text-sm focus:border-[var(--color-brand-cyan)] focus:outline-none"
        />
        <span className="text-xs text-[var(--color-brand-text-secondary)]">La misma semilla siempre genera el mismo universo.</span>
      </div>

      {error && <p className="text-sm text-[var(--color-brand-red)]">{error}</p>}

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
        description="100,000 pólizas de referencia con 3 años de exposición (2021-2023) — cada equipo la usa para calibrar su modelo de frecuencia/severidad antes de tarificar el 2027, con retos deliberados de transferibilidad (variables, moneda UF, brecha temporal) entre Chile y Colombia."
        latest={initialChile}
        onGenerate={() => generate("chile")}
        loading={loadingKind === "chile"}
        downloadHref="/api/universe/chile-csv"
      />
    </div>
  );
}
