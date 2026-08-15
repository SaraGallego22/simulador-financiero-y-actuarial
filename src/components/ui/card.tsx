import { type ComponentPropsWithoutRef } from "react";

type CardAccent = "blue" | "gray" | "none";
type CardPadding = "sm" | "md" | "lg";

export interface CardProps extends ComponentPropsWithoutRef<"div"> {
  accent?: CardAccent;
  /** Adds a hover lift + shadow, for clickable/interactive cards (e.g. the dashboard's Día cards). */
  hoverable?: boolean;
  padding?: CardPadding;
  /** Translucent, blurred surface instead of the opaque one — lets an ambient SVG background show through. Use over DashboardHero/AdminHero, never over dense data (readability). */
  glass?: boolean;
}

const paddingClasses: Record<CardPadding, string> = {
  sm: "p-3",
  md: "p-4",
  lg: "p-6",
};

// A thick border-top accent clashes visually with a rounded corner (the
// straight bar appears to cut into the curve), so accented cards square off
// the top corners and only round the bottom — the accent bar then sits
// flush against a straight edge instead of fighting the radius.
const accentClasses: Record<CardAccent, string> = {
  blue: "rounded-t-none border-t-4 border-t-[var(--color-brand-blue-accent)]",
  gray: "rounded-t-none border-t-4 border-t-[var(--color-brand-gray-light)]",
  none: "rounded-t-[var(--radius-lg)]",
};

/**
 * Extracts the `rounded-lg border ... bg-surface p-4` card pattern repeated
 * across dashboard/admin pages into a single primitive with a consistent
 * radius/shadow/hover language.
 */
export function Card({
  accent = "none",
  hoverable = false,
  padding = "md",
  glass = false,
  className = "",
  children,
  ...props
}: CardProps) {
  return (
    <div
      className={`rounded-b-[var(--radius-lg)] border border-[var(--color-brand-gray-light)] shadow-[var(--shadow-sm)] ${
        glass ? "bg-[var(--brand-glass-surface)] backdrop-blur-md" : "bg-[var(--color-brand-surface)]"
      } ${
        hoverable ? "transition-all duration-200 hover:-translate-y-0.5 hover:shadow-[var(--shadow-md)]" : ""
      } ${paddingClasses[padding]} ${accentClasses[accent]} ${className}`}
      {...props}
    >
      {children}
    </div>
  );
}
