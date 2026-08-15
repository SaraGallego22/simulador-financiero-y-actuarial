/**
 * Angular, faceted geometric band for the team dashboard hero (an abstract
 * nod to "protection"/shield facets, not a literal icon) — distinguishes
 * the team's workspace from AdminHero's dot-grid "control panel" motif.
 */
export function DashboardHero() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 1200 300"
      preserveAspectRatio="xMidYMid slice"
      className="bg-decorative pointer-events-none absolute inset-0 -z-10 h-full w-full"
      style={{ opacity: "var(--decorative-opacity)" }}
    >
      <defs>
        <linearGradient id="dashFacetA" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" style={{ stopColor: "var(--color-brand-blue)" }} />
          <stop offset="100%" style={{ stopColor: "var(--color-brand-blue-vivid)" }} />
        </linearGradient>
        <linearGradient id="dashFacetB" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" style={{ stopColor: "var(--color-brand-cyan)" }} />
          <stop offset="100%" style={{ stopColor: "var(--color-brand-cyan-vivid)" }} />
        </linearGradient>
      </defs>
      <polygon points="0,0 420,0 260,300 0,300" fill="url(#dashFacetA)" />
      <polygon points="380,0 720,0 560,300 260,300" fill="url(#dashFacetB)" />
      <polygon points="680,0 1000,0 900,300 560,300" fill="url(#dashFacetA)" />
      <polygon points="960,0 1200,0 1200,300 900,300" style={{ fill: "var(--color-brand-yellow-soft)" }} />
    </svg>
  );
}
