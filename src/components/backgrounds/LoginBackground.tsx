/**
 * Abstract echo of the SURA wordmark's wing glyph — a fan of 8 tapered
 * blades radiating from a point, blue at the pivot fading to cyan at the
 * tips — rather than a generic blob glow, so the login backdrop actually
 * reads as SURA rather than "some blue gradient." Inline SVG (not a static
 * file) so gradient stops can reference the brand CSS custom properties and
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
        <radialGradient id="loginGlow" cx="50%" cy="50%" r="50%">
          <stop offset="0%" style={{ stopColor: "var(--color-brand-blue-vivid)" }} />
          <stop offset="100%" style={{ stopColor: "var(--color-brand-blue-vivid)", stopOpacity: 0 }} />
        </radialGradient>
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
      <circle cx="660" cy="90" r="260" fill="url(#loginGlow)" opacity="0.35" />
      <use href="#sura-wing" transform="translate(560 90) rotate(-8) scale(1.35)" opacity="0.85" />
      <use href="#sura-wing" transform="translate(95 545) rotate(172) scale(0.85)" opacity="0.5" />
    </svg>
  );
}
