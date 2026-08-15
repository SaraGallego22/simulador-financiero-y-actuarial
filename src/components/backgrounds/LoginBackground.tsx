/**
 * Bold abstract echo of the SURA wordmark's wing glyph — fans of 8 tapered
 * blades radiating from a point, blue at the pivot fading to cyan at the
 * tips — layered with a fine dot-grid wash (same texture language as
 * AdminHero) and a couple of thin orbit rings for a modern, designed feel,
 * instead of a generic blob glow. Inline SVG (not a static file) so
 * gradient/fill stops can reference the brand CSS custom properties and
 * follow dark mode automatically. `.bg-decorative` is hidden under print.
 *
 * Unlike DashboardHero/AdminHero, this doesn't sit behind body text (the
 * login form is on an opaque card), so it doesn't share the app-wide
 * `--decorative-opacity` budget kept low for legibility elsewhere — it can
 * render at near-full strength and still read cleanly.
 */
export function LoginBackground() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 800 600"
      preserveAspectRatio="xMidYMid slice"
      className="bg-decorative pointer-events-none absolute inset-0 -z-10 h-full w-full"
    >
      <defs>
        <linearGradient id="loginWing" x1="0%" y1="50%" x2="100%" y2="50%">
          <stop offset="0%" style={{ stopColor: "var(--color-brand-blue-vivid)" }} />
          <stop offset="100%" style={{ stopColor: "var(--color-brand-cyan-vivid)" }} />
        </linearGradient>
        <radialGradient id="loginGlowBlue" cx="50%" cy="50%" r="50%">
          <stop offset="0%" style={{ stopColor: "var(--color-brand-blue-vivid)" }} />
          <stop offset="100%" style={{ stopColor: "var(--color-brand-blue-vivid)", stopOpacity: 0 }} />
        </radialGradient>
        <radialGradient id="loginGlowCyan" cx="50%" cy="50%" r="50%">
          <stop offset="0%" style={{ stopColor: "var(--color-brand-cyan-vivid)" }} />
          <stop offset="100%" style={{ stopColor: "var(--color-brand-cyan-vivid)", stopOpacity: 0 }} />
        </radialGradient>
        <pattern id="loginDots" width="26" height="26" patternUnits="userSpaceOnUse">
          <circle cx="2" cy="2" r="1.6" style={{ fill: "var(--color-brand-blue-accent)" }} />
        </pattern>
        <g id="sura-wing">
          <polygon points="0,0 127.8,-57.8 119.4,-73.6" fill="url(#loginWing)" />
          <polygon points="0,0 191.1,-59.9 184.9,-76.9" fill="url(#loginWing)" />
          <polygon points="0,0 246.4,-43.2 242.6,-60.8" fill="url(#loginWing)" />
          <polygon points="0,0 290.0,-11.3 288.8,-29.3" fill="url(#loginWing)" />
          <polygon points="0,0 308.8,30.7 310.0,12.7" fill="url(#loginWing)" />
          <polygon points="0,0 281.7,69.1 285.5,51.5" fill="url(#loginWing)" />
          <polygon points="0,0 222.5,90.6 228.7,73.6" fill="url(#loginWing)" />
          <polygon points="0,0 145.9,87.7 154.3,71.8" fill="url(#loginWing)" />
        </g>
      </defs>

      {/* Faint full-bleed texture, tying the login screen to the same
          dot-grid language as the admin/team shells beyond it. */}
      <rect width="100%" height="100%" fill="url(#loginDots)" opacity="0.35" />

      {/* Soft color wash behind the wings for depth. */}
      <circle cx="700" cy="40" r="320" fill="url(#loginGlowBlue)" opacity="0.45" />
      <circle cx="40" cy="600" r="300" fill="url(#loginGlowCyan)" opacity="0.3" />

      {/* Thin orbit rings — a modern accent echoing "motion" around the wing. */}
      <circle cx="760" cy="30" r="180" fill="none" stroke="var(--color-brand-cyan-vivid)" strokeWidth="1.5" opacity="0.35" />
      <circle cx="760" cy="30" r="240" fill="none" stroke="var(--color-brand-blue-vivid)" strokeWidth="1" opacity="0.2" />

      {/* A large, very faint wing behind everything, off-center, for depth. */}
      <use href="#sura-wing" transform="translate(430 260) rotate(35) scale(2.6)" opacity="0.06" />

      {/* The two primary wings, bold and clearly SURA. */}
      <use href="#sura-wing" transform="translate(600 60) rotate(-10) scale(1.8)" opacity="0.95" />
      <use href="#sura-wing" transform="translate(60 580) rotate(168) scale(1.25)" opacity="0.65" />
    </svg>
  );
}
