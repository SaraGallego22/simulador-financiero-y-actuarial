import { INSTRUMENTS } from "@/domain/finance/instruments";

export function InstrumentsPanel({ showCovariance = false }: { showCovariance?: boolean }) {
  return (
    <div className="rounded-lg border border-[var(--color-brand-gray-light)] bg-[var(--color-brand-surface)] p-5">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <h3 className="font-[family-name:var(--font-condensed)] text-sm font-bold uppercase tracking-wide text-[var(--color-brand-blue-accent)]">
          Instrumentos disponibles
        </h3>
        <div className="flex flex-wrap gap-3">
          <a href="/api/instruments?kind=menu" className="text-xs text-[var(--color-brand-blue-accent)] underline">
            Descargar menú (CSV)
          </a>
          {showCovariance && (
            <a href="/api/instruments?kind=covarianza" className="text-xs text-[var(--color-brand-blue-accent)] underline">
              Descargar matriz de covarianza (CSV)
            </a>
          )}
        </div>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs uppercase tracking-wide text-[var(--color-brand-text-secondary)]">
              <th className="py-1 pr-4">ID</th>
              <th className="py-1 pr-4">Nombre</th>
              <th className="py-1 pr-4">Rendimiento EA</th>
              <th className="py-1 pr-4">Plazo</th>
              <th className="py-1 pr-4">Nota</th>
            </tr>
          </thead>
          <tbody>
            {INSTRUMENTS.map((ins) => (
              <tr key={ins.id} className="border-t border-[var(--color-brand-gray-light)]">
                <td className="py-1 pr-4 font-mono">{ins.id}</td>
                <td className="py-1 pr-4">{ins.nombre}</td>
                <td className="py-1 pr-4">{(ins.yield * 100).toFixed(1)}%</td>
                <td className="py-1 pr-4">{ins.plazoM >= 400 ? "sin venc." : `${ins.plazoM} meses`}</td>
                <td className="py-1 pr-4 text-[var(--color-brand-text-secondary)]">{ins.nota}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
