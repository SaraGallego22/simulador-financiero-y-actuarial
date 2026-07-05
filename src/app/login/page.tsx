"use client";

import { useState, type FormEvent } from "react";
import { signIn } from "next-auth/react";
import { useRouter } from "next/navigation";

export default function LoginPage() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    const formData = new FormData(e.currentTarget);
    const result = await signIn("credentials", {
      username: formData.get("username"),
      password: formData.get("password"),
      redirect: false,
    });

    setLoading(false);
    if (!result || result.error) {
      setError("Usuario o contraseña incorrectos.");
      return;
    }
    router.push("/");
    router.refresh();
  }

  return (
    <main className="flex flex-1 items-center justify-center p-6">
      <form
        onSubmit={handleSubmit}
        className="w-full max-w-sm rounded-lg border border-[var(--color-brand-gray-light)] bg-white p-8 shadow-sm"
      >
        <h1 className="mb-1 font-[family-name:var(--font-condensed)] text-xl font-bold uppercase tracking-wide text-[var(--color-brand-blue)]">
          Simulador Financiero y Actuarial
        </h1>
        <p className="mb-6 text-sm text-gray-500">Ingresa con el usuario y contraseña de tu equipo.</p>

        <label htmlFor="username" className="mb-1 block text-sm font-medium text-gray-700">
          Usuario
        </label>
        <input
          id="username"
          name="username"
          required
          autoComplete="username"
          className="mb-4 w-full rounded border border-gray-300 px-3 py-2 text-sm focus:border-[var(--color-brand-cyan)] focus:outline-none"
        />

        <label htmlFor="password" className="mb-1 block text-sm font-medium text-gray-700">
          Contraseña
        </label>
        <input
          id="password"
          name="password"
          type="password"
          required
          autoComplete="current-password"
          className="mb-4 w-full rounded border border-gray-300 px-3 py-2 text-sm focus:border-[var(--color-brand-cyan)] focus:outline-none"
        />

        {error && <p className="mb-4 text-sm text-red-600">{error}</p>}

        <button
          type="submit"
          disabled={loading}
          className="w-full rounded bg-[var(--color-brand-blue)] px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-[var(--color-brand-blue-dark)] disabled:opacity-50"
        >
          {loading ? "Ingresando..." : "Ingresar"}
        </button>
      </form>
    </main>
  );
}
