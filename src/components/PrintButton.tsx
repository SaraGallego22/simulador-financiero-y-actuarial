"use client";

export function PrintButton({ label = "Descargar / Imprimir (PDF)" }: { label?: string }) {
  return (
    <button
      type="button"
      onClick={() => window.print()}
      className="rounded-full bg-[image:var(--gradient-brand-primary)] px-4 py-2 font-[family-name:var(--font-condensed)] text-sm font-bold uppercase tracking-wide text-white shadow-[var(--shadow-sm)] transition-all hover:-translate-y-0.5 hover:shadow-[var(--shadow-md)] hover:brightness-110 active:translate-y-0"
    >
      {label}
    </button>
  );
}
