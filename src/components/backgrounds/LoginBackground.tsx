/**
 * Soft, organic blob glow behind the login card. Inline SVG (not a static
 * file) so gradient stops can reference the brand CSS custom properties and
 * follow dark mode automatically. `.bg-decorative` is hidden under print.
 */
export function LoginBackground() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 800 600"
      preserveAspectRatio="xMidYMid slice"
      className="bg-decorative pointer-events-none absolute inset-0 -z-10 h-full w-full"
      style={{ opacity: "var(--decorative-opacity)" }}
    >
      <defs>
        <radialGradient id="loginBlobBlue" cx="50%" cy="50%" r="50%">
          <stop offset="0%" style={{ stopColor: "var(--color-brand-blue-vivid)" }} />
          <stop offset="100%" style={{ stopColor: "var(--color-brand-blue-vivid)", stopOpacity: 0 }} />
        </radialGradient>
        <radialGradient id="loginBlobCyan" cx="50%" cy="50%" r="50%">
          <stop offset="0%" style={{ stopColor: "var(--color-brand-cyan-vivid)" }} />
          <stop offset="100%" style={{ stopColor: "var(--color-brand-cyan-vivid)", stopOpacity: 0 }} />
        </radialGradient>
        <radialGradient id="loginBlobYellow" cx="50%" cy="50%" r="50%">
          <stop offset="0%" style={{ stopColor: "var(--color-brand-yellow-soft)" }} />
          <stop offset="100%" style={{ stopColor: "var(--color-brand-yellow-soft)", stopOpacity: 0 }} />
        </radialGradient>
      </defs>
      <circle cx="120" cy="70" r="360" fill="url(#loginBlobBlue)" />
      <circle cx="720" cy="110" r="280" fill="url(#loginBlobCyan)" />
      <circle cx="640" cy="580" r="320" fill="url(#loginBlobYellow)" />
      <circle cx="70" cy="560" r="220" fill="url(#loginBlobCyan)" />
    </svg>
  );
}
