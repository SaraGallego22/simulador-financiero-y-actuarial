"use client";

import { useState, type FormEvent } from "react";
import { signIn } from "next-auth/react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { Button } from "@/components/ui/button";
import { ThemeToggle } from "@/components/ThemeToggle";

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
    <main className="relative flex flex-1 items-center justify-center p-6">
      <div className="absolute right-4 top-4">
        <ThemeToggle />
      </div>
      <div className="w-full max-w-sm overflow-hidden rounded-lg border border-[var(--color-brand-gray-light)] bg-[var(--color-brand-surface)] shadow-md">
        <div className="flex items-center justify-center bg-[var(--color-brand-blue)] px-8 py-6">
          <Image src="/logo_sura.png" alt="Seguros SURA" width={140} height={55} className="h-12 w-auto" priority />
        </div>

        <form onSubmit={handleSubmit} className="p-8">
          <h1 className="mb-1 font-[family-name:var(--font-condensed)] text-2xl font-bold uppercase tracking-wide text-[var(--color-brand-blue-accent)]">
            Pasantía SURA 2026
          </h1>
          <p className="mb-6 text-sm text-[var(--color-brand-text-secondary)]">
            Ingresa con el usuario y contraseña de tu equipo.
          </p>

          <label htmlFor="username" className="mb-1 block text-sm font-medium text-[var(--color-foreground)]">
            Usuario
          </label>
          <input
            id="username"
            name="username"
            required
            autoComplete="username"
            className="mb-4 h-9 w-full rounded border border-[var(--color-brand-gray-light)] bg-[var(--color-brand-surface)] px-3 text-sm text-[var(--color-foreground)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-brand-blue-accent)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--color-brand-surface)]"
          />

          <label htmlFor="password" className="mb-1 block text-sm font-medium text-[var(--color-foreground)]">
            Contraseña
          </label>
          <input
            id="password"
            name="password"
            type="password"
            required
            autoComplete="current-password"
            className="mb-4 h-9 w-full rounded border border-[var(--color-brand-gray-light)] bg-[var(--color-brand-surface)] px-3 text-sm text-[var(--color-foreground)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-brand-blue-accent)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--color-brand-surface)]"
          />

          <div role="alert" aria-live="assertive" className="mb-4 min-h-[1.25rem] text-sm text-[var(--color-brand-red)]">
            {error}
          </div>

          <Button type="submit" variant="primary" size="lg" loading={loading} loadingText="Ingresando..." className="w-full">
            Ingresar
          </Button>
        </form>
      </div>
    </main>
  );
}
