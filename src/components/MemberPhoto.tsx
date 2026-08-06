/** Small round headshot next to a member's name, falling back to their initial when no photo was uploaded. */
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
      style={{ width: size, height: size }}
      className="inline-flex shrink-0 items-center justify-center rounded-full bg-[var(--color-brand-gray-light)] align-middle text-[10px] font-semibold text-[var(--color-brand-text-secondary)]"
    >
      {name.trim().charAt(0).toUpperCase() || "?"}
    </span>
  );
}
