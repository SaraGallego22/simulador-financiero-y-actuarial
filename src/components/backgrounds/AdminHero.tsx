/**
 * Dot-grid/mesh pattern for the admin landing hero — distinct from
 * DashboardHero's angular facets, signals "control panel" rather than
 * "workspace".
 */
export function AdminHero() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 1200 300"
      preserveAspectRatio="xMidYMid slice"
      className="bg-decorative pointer-events-none absolute inset-0 -z-10 h-full w-full"
      style={{ opacity: "var(--decorative-opacity)" }}
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
      <rect width="1200" height="300" fill="url(#adminDots)" />
      <rect width="1200" height="300" fill="url(#adminWash)" />
    </svg>
  );
}
