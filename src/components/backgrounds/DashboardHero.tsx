/**
 * Ambient background for the whole team-side content column (mounted once
 * in (team)/layout.tsx, behind every page, not just the dashboard) — a
 * faceted diagonal-stripe pattern in the brand palette. Built from a
 * repeating <pattern>, not fixed-size shapes, so it tiles correctly at any
 * viewport height instead of stretching/distorting like a fixed-viewBox
 * illustration would. Distinguishes the team's workspace from AdminHero's
 * dot-grid "control panel" motif.
 */
export function DashboardHero() {
  return (
    <svg
      aria-hidden="true"
      className="bg-decorative pointer-events-none absolute inset-0 -z-10 h-full w-full"
      style={{ opacity: "var(--decorative-opacity)" }}
      preserveAspectRatio="none"
    >
      <defs>
        <linearGradient id="dashStripeA" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" style={{ stopColor: "var(--color-brand-blue)" }} />
          <stop offset="100%" style={{ stopColor: "var(--color-brand-blue-vivid)" }} />
        </linearGradient>
        <linearGradient id="dashStripeB" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" style={{ stopColor: "var(--color-brand-cyan)" }} />
          <stop offset="100%" style={{ stopColor: "var(--color-brand-cyan-vivid)" }} />
        </linearGradient>
        <pattern id="dashFacets" width="220" height="220" patternUnits="userSpaceOnUse" patternTransform="rotate(20)">
          <rect width="220" height="220" fill="none" />
          <polygon points="0,0 110,0 55,190 0,190" fill="url(#dashStripeA)" />
          <polygon points="90,0 200,0 145,190 35,190" fill="url(#dashStripeB)" />
          <polygon points="180,0 220,0 220,190 165,190" style={{ fill: "var(--color-brand-yellow-soft)" }} fillOpacity={0.7} />
        </pattern>
      </defs>
      <rect width="100%" height="100%" fill="url(#dashFacets)" />
    </svg>
  );
}
