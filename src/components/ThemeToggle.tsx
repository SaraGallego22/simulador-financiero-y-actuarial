"use client";

import { useSyncExternalStore } from "react";

const THEME_EVENT = "themechange";

function subscribe(callback: () => void) {
  window.addEventListener(THEME_EVENT, callback);
  return () => window.removeEventListener(THEME_EVENT, callback);
}

function getSnapshot() {
  return document.documentElement.classList.contains("dark");
}

function getServerSnapshot() {
  return false;
}

function SunIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="h-4 w-4">
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2.5M12 19.5V22M4.22 4.22l1.77 1.77M18 18l1.78 1.78M2 12h2.5M19.5 12H22M4.22 19.78L6 18M18 6l1.78-1.78" />
    </svg>
  );
}

function MoonIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className="h-4 w-4">
      <path d="M21.752 15.002A9.72 9.72 0 0118 15.75c-5.385 0-9.75-4.365-9.75-9.75 0-1.33.266-2.597.748-3.752A9.753 9.753 0 003 11.25C3 16.635 7.365 21 12.75 21a9.753 9.753 0 009.002-5.998z" />
    </svg>
  );
}

/** Sun/moon toggle for the manual `.dark` class strategy (see globals.css). Persists to localStorage. */
export function ThemeToggle({ onDark = false }: { onDark?: boolean }) {
  const isDark = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  function toggle() {
    const next = !document.documentElement.classList.contains("dark");
    document.documentElement.classList.toggle("dark", next);
    localStorage.setItem("theme", next ? "dark" : "light");
    window.dispatchEvent(new Event(THEME_EVENT));
  }

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={isDark ? "Cambiar a modo claro" : "Cambiar a modo oscuro"}
      title={isDark ? "Modo claro" : "Modo oscuro"}
      className={`flex h-8 w-8 items-center justify-center rounded-full transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 ${
        onDark
          ? "text-white/80 hover:bg-white/10 hover:text-white focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--color-brand-blue)]"
          : "text-[var(--color-brand-text-secondary)] hover:bg-[var(--color-brand-gray-light)] focus-visible:ring-[var(--color-brand-blue-accent)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--color-brand-surface)]"
      }`}
    >
      {isDark ? <SunIcon /> : <MoonIcon />}
    </button>
  );
}
