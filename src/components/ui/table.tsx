import { type ComponentPropsWithoutRef, type ReactNode } from "react";

/**
 * Thin styling wrapper around a native `<table>` — replaces the same
 * `overflow-x-auto rounded-lg border ... bg-surface` + `bg-brand-blue`
 * header + flat `border-t` rows pattern repeated in ~12 page files.
 * Deliberately styling-only: callers keep writing their own `<th>`/`<td>`
 * content, since column shapes vary too much for a data-grid abstraction.
 * No sort/filter — out of scope for this visual pass.
 */
export function Table({ className = "", children, ...props }: ComponentPropsWithoutRef<"table">) {
  return (
    <div className="overflow-auto rounded-[var(--radius-lg)] border border-[var(--color-brand-gray-light)] bg-[var(--color-brand-surface)] shadow-[var(--shadow-sm)]">
      <table className={`w-full text-sm ${className}`} {...props}>
        {children}
      </table>
    </div>
  );
}

function TableHead({ children }: { children: ReactNode }) {
  return (
    <thead className="sticky top-0 z-10">
      <tr className="bg-[var(--color-brand-blue)] text-left text-white">{children}</tr>
    </thead>
  );
}

function TableRow({ className = "", children, ...props }: ComponentPropsWithoutRef<"tr">) {
  return (
    <tr
      className={`border-t border-[var(--color-brand-gray-light)] transition-colors even:bg-[var(--color-brand-blue-light)]/40 hover:bg-[var(--color-brand-blue-light)] ${className}`}
      {...props}
    >
      {children}
    </tr>
  );
}

Table.Head = TableHead;
Table.Row = TableRow;
