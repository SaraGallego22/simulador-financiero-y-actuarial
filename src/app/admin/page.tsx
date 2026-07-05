import { signOutAction } from "@/lib/actions";

export default function AdminHome() {
  return (
    <main className="mx-auto flex w-full max-w-4xl flex-1 flex-col gap-4 p-8">
      <div className="flex items-center justify-between">
        <h1 className="font-[family-name:var(--font-condensed)] text-2xl font-bold uppercase tracking-wide text-[var(--color-brand-blue)]">
          Panel de administración
        </h1>
        <form action={signOutAction}>
          <button type="submit" className="text-sm text-gray-500 underline hover:text-gray-700">
            Cerrar sesión
          </button>
        </form>
      </div>
      <p className="text-sm text-gray-600">
        Desde aquí el evaluador genera el universo de datos, configura la rúbrica, crea las cuentas de los
        equipos, dispara las simulaciones y califica cada día del reto. (Vistas en construcción.)
      </p>
    </main>
  );
}
