/** Round headshot, falling back to the member's initial when no photo was uploaded. Fallback font size scales with `size` so it still reads at larger sizes. */
export function MemberPhoto({ dataUri, name, size = 24 }: { dataUri: string | null; name: string; size?: number }) {
  if (dataUri) {
    return (
      // eslint-disable-next-line @next/next/no-img-element -- tiny base64 data: URI from Postgres, not an optimizable remote asset
      <img
        src={dataUri}
        alt={name}
        style={{ width: size, height: size }}
        className="inline-block shrink-0 rounded-full object-cover align-middle"
      />
    );
  }

  return (
    <span
      style={{ width: size, height: size, fontSize: Math.max(10, Math.round(size * 0.4)) }}
      className="inline-flex shrink-0 items-center justify-center rounded-full bg-[var(--color-brand-gray-light)] align-middle font-semibold text-[var(--color-brand-text-secondary)]"
    >
      {name.trim().charAt(0).toUpperCase() || "?"}
    </span>
  );
}
