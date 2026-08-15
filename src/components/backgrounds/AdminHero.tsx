/**
 * Ambient background for the whole admin-side content column (mounted once
 * in admin/layout.tsx, behind every page) — a dot-grid/mesh pattern,
 * distinct from DashboardHero's diagonal facets, signals "control panel"
 * rather than "workspace". No viewBox/preserveAspectRatio scaling — the
 * pattern is defined in real pixel units so the grid stays a consistent
 * fine mesh regardless of viewport height, instead of stretching.
 */
export function AdminHero() {
  return (
    <svg
      aria-hidden="true"
      className="bg-decorative pointer-events-none absolute inset-0 -z-10 h-full w-full"
      style={{ opacity: "var(--decorative-opacity)" }}
      preserveAspectRatio="none"
    >
      <defs>
        <pattern id="adminDots" width="28" height="28" patternUnits="userSpaceOnUse">
          <circle cx="2" cy="2" r="2" style={{ fill: "var(--color-brand-blue-accent)" }} />
        </pattern>
        <linearGradient id="adminWash" x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" style={{ stopColor: "var(--color-brand-cyan-vivid)", stopOpacity: 0.6 }} />
          <stop offset="100%" style={{ stopColor: "var(--color-brand-cyan-vivid)", stopOpacity: 0 }} />
        </linearGradient>
      </defs>
      <rect width="100%" height="100%" fill="url(#adminDots)" />
      <rect width="45%" height="100%" fill="url(#adminWash)" />
    </svg>
  );
}
