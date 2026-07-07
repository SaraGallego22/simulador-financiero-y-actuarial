"use client";

export function PrintButton({ label = "Descargar / Imprimir (PDF)" }: { label?: string }) {
  return (
    <button
      type="button"
      onClick={() => window.print()}
      className="rounded-md bg-[var(--color-brand-blue)] px-4 py-2 font-[family-name:var(--font-condensed)] text-sm font-bold uppercase tracking-wide text-white transition-colors hover:bg-[var(--color-brand-blue-dark)]"
    >
      {label}
    </button>
  );
}
