"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { parseCsv } from "@/lib/csv";
import { tariffCsvSchema } from "@/lib/csvSchemas";
import { N_COLOMBIA } from "@/domain/generation/constants";
import { TARIFF_CHUNK_ROWS, MIN_COVERAGE, chunkCount } from "@/lib/tariffUpload";
import { Button } from "@/components/ui/button";

type Status =
  | { phase: "idle" }
  | { phase: "parsing" }
  | { phase: "uploading"; sent: number; total: number }
  | { phase: "done"; meanPremium: number }
  | { phase: "outsourced"; revealed: boolean; meanPremium: number | null }
  | { phase: "error"; message: string };

type OutsourceStatus =
  | { phase: "idle" }
  | { phase: "confirming" }
  | { phase: "submitting" }
  | { phase: "error"; message: string };

export function TariffUpload({
  day,
  initialComplete,
  initialMeanPremium,
  initialOutsourced,
  resultsPublished,
}: {
  day: number;
  initialComplete: boolean;
  /** Already withheld (null) by the caller when initialOutsourced && !resultsPublished. */
  initialMeanPremium: number | null;
  initialOutsourced: boolean;
  resultsPublished: boolean;
}) {
  const router = useRouter();
  const [status, setStatus] = useState<Status>(() => {
    if (!initialComplete) return { phase: "idle" };
    if (initialOutsourced) return { phase: "outsourced", revealed: resultsPublished, meanPremium: initialMeanPremium };
    return { phase: "done", meanPremium: initialMeanPremium ?? 0 };
  });
  const [outsourceStatus, setOutsourceStatus] = useState<OutsourceStatus>({ phase: "idle" });
  const [fileName, setFileName] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const busy = status.phase === "parsing" || status.phase === "uploading";
  const complete = status.phase === "done" || status.phase === "outsourced";

  async function handleFile(file: File) {
    setFileName(file.name);
    setStatus({ phase: "parsing" });
    const text = await file.text();
    const { rows, errors } = parseCsv(text, tariffCsvSchema);

    if (rows.length < N_COLOMBIA * MIN_COVERAGE) {
      setStatus({
        phase: "error",
        message: `El CSV solo tiene ${rows.length.toLocaleString("es-CO")} filas válidas de ${N_COLOMBIA.toLocaleString("es-CO")} requeridas (mínimo ${MIN_COVERAGE * 100}%).${
          errors.length ? ` ${errors.length} fila(s) con error.` : ""
        }`,
      });
      return;
    }

    const premiums = new Float32Array(N_COLOMBIA);
    for (const row of rows) {
      const index = row.id_expuesto - 1;
      if (index >= 0 && index < N_COLOMBIA) premiums[index] = row.prima;
    }

    const total = chunkCount(N_COLOMBIA);
    setStatus({ phase: "uploading", sent: 0, total });

    try {
      for (let i = 0; i < total; i++) {
        const startRow = i * TARIFF_CHUNK_ROWS;
        const endRow = Math.min(startRow + TARIFF_CHUNK_ROWS, N_COLOMBIA);
        const chunk = premiums.subarray(startRow, endRow);

        const res = await fetch(`/api/teams/tariffs?day=${day}&chunkIndex=${i}&totalChunks=${total}`, {
          method: "POST",
          headers: { "Content-Type": "application/octet-stream" },
          body: chunk,
        });
        if (!res.ok) {
          const body = await res.json().catch(() => null);
          throw new Error(body?.error ?? `Error subiendo el fragmento ${i + 1}/${total}`);
        }
        const json = await res.json();
        setStatus({ phase: "uploading", sent: i + 1, total });
        if (json.complete) {
          setStatus({ phase: "done", meanPremium: json.meanPremium });
          router.refresh();
        }
      }
    } catch (e) {
      setStatus({ phase: "error", message: e instanceof Error ? e.message : String(e) });
    }
  }

  async function confirmOutsource() {
    setOutsourceStatus({ phase: "submitting" });
    try {
      const res = await fetch("/api/teams/tariffs/outsource", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ day }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error(body?.error ?? "Error al tercerizar la tarifa");
      }
      // The endpoint doesn't return the premium — it stays hidden until this
      // day's results are published (see hasPublishedResults()).
      setStatus({ phase: "outsourced", revealed: false, meanPremium: null });
      setOutsourceStatus({ phase: "idle" });
      router.refresh();
    } catch (e) {
      setOutsourceStatus({ phase: "error", message: e instanceof Error ? e.message : String(e) });
    }
  }

  return (
    <div className="rounded-lg border border-[var(--color-brand-gray-light)] border-t-4 border-t-[var(--color-brand-blue-accent)] bg-[var(--color-brand-surface)] p-5">
      <h3 className="mb-2 font-[family-name:var(--font-condensed)] text-sm font-bold uppercase tracking-wide text-[var(--color-brand-blue-accent)]">
        Tarifas — Día {day}
      </h3>
      <p className="mb-3 text-sm text-[var(--color-brand-text-secondary)]">
        Sube un CSV con columnas <code>id_expuesto,prima</code> cubriendo al menos el {MIN_COVERAGE * 100}% de las{" "}
        {N_COLOMBIA.toLocaleString("es-CO")} pólizas del universo.
      </p>

      <input
        ref={inputRef}
        type="file"
        accept=".csv"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) handleFile(file);
          e.target.value = "";
        }}
        disabled={busy}
        className="hidden"
      />
      <div className="mb-3 flex items-center gap-3">
        <Button type="button" variant="secondary" size="default" onClick={() => inputRef.current?.click()} disabled={busy}>
          Elegir archivo CSV
        </Button>
        <span className="truncate text-sm text-[var(--color-brand-text-secondary)]">
          {fileName ?? "Ningún archivo seleccionado"}
        </span>
      </div>

      {status.phase === "parsing" && <p className="text-sm text-[var(--color-brand-text-secondary)]">Leyendo y validando el CSV…</p>}
      {status.phase === "uploading" && (
        <p className="text-sm text-[var(--color-brand-text-secondary)]">
          Subiendo… {status.sent}/{status.total} fragmentos
        </p>
      )}
      {status.phase === "error" && <p className="text-sm text-[var(--color-brand-red)]">{status.message}</p>}
      {status.phase === "done" && (
        <p className="text-sm text-[var(--color-brand-green)]">
          Tarifa cargada. Prima promedio: ${status.meanPremium.toLocaleString("es-CO", { maximumFractionDigits: 0 })}
        </p>
      )}
      {status.phase === "outsourced" && (
        <div className="rounded border border-[var(--color-brand-gray-light)] bg-[var(--color-brand-cyan-light)] p-3">
          <p className="text-sm font-semibold text-[var(--color-brand-blue-accent)]">
            Tarifa tercerizada — consultora chilena, sin experiencia en el mercado colombiano
          </p>
          {status.revealed && status.meanPremium != null ? (
            <>
              <p className="mt-1 text-sm text-[var(--color-brand-text-secondary)]">
                Prima promedio asignada: ${status.meanPremium.toLocaleString("es-CO", { maximumFractionDigits: 0 })}. Puedes reemplazarla en cualquier
                momento subiendo tu propio CSV arriba.
              </p>
              <a
                href={`/api/teams/tariffs/outsource?day=${day}`}
                className="mt-2 inline-block text-sm font-medium text-[var(--color-brand-blue-accent)] underline"
              >
                Descargar la tarifa que te asignaron
              </a>
            </>
          ) : (
            <p className="mt-1 text-sm text-[var(--color-brand-text-secondary)]">
              El detalle de esta tarifa (prima promedio y descarga) estará disponible cuando se publiquen los resultados objetivos de este día. Puedes
              reemplazarla en cualquier momento subiendo tu propio CSV arriba.
            </p>
          )}
        </div>
      )}

      {!complete && (
        <div className="mt-4 border-t border-[var(--color-brand-gray-light)] pt-3">
          {outsourceStatus.phase === "idle" && (
            <Button type="button" variant="secondary" size="sm" onClick={() => setOutsourceStatus({ phase: "confirming" })} disabled={busy}>
              Opción de emergencia: tercerizar tarifas
            </Button>
          )}
          {outsourceStatus.phase === "confirming" && (
            <div className="rounded border border-[var(--color-brand-gray-light)] bg-[var(--color-brand-cyan-light)] p-3">
              <p className="text-sm text-[var(--color-brand-text-secondary)]">
                <span className="font-semibold text-[var(--color-brand-blue-accent)]">Opción de emergencia:</span> contratar a una consultora chilena, sin
                experiencia en el mercado colombiano, para que defina tus tarifas. Vas a poder participar en el mercado con el precio que ellos asignen, y
                el costo de esa consultoría corre por tu cuenta. Esta acción reemplaza cualquier tarifa que hayas empezado a subir.
              </p>
              <div className="mt-2 flex gap-2">
                <Button type="button" size="sm" onClick={confirmOutsource}>
                  Confirmar tercerización
                </Button>
                <Button type="button" variant="secondary" size="sm" onClick={() => setOutsourceStatus({ phase: "idle" })}>
                  Cancelar
                </Button>
              </div>
            </div>
          )}
          {outsourceStatus.phase === "submitting" && <p className="text-sm text-[var(--color-brand-text-secondary)]">Tercerizando…</p>}
          {outsourceStatus.phase === "error" && <p className="text-sm text-[var(--color-brand-red)]">{outsourceStatus.message}</p>}
        </div>
      )}
    </div>
  );
}
