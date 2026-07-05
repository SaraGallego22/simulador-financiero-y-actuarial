import { ModelDocs } from "@/components/ModelDocs";

export default function AdminModeloPage() {
  return (
    <main className="mx-auto flex w-full max-w-4xl flex-1 flex-col gap-4 p-8">
      <div>
        <h1 className="font-[family-name:var(--font-condensed)] text-2xl font-bold uppercase tracking-wide text-[var(--color-brand-blue)]">
          Modelo técnico
        </h1>
        <p className="text-sm text-gray-600">
          Referencia de cómo funciona el motor detrás de cada día: generación del universo, mercado, reservas,
          finanzas y analítica.
        </p>
      </div>
      <ModelDocs />
    </main>
  );
}
