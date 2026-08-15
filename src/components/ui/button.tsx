import { type ComponentPropsWithoutRef, type ReactNode } from "react";

type ButtonVariant = "primary" | "secondary" | "ghost";
type ButtonSize = "sm" | "default" | "lg";

export interface ButtonProps extends ComponentPropsWithoutRef<"button"> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  /** Use on dark (brand-blue) backgrounds, e.g. the sidebar. */
  onDark?: boolean;
  loading?: boolean;
  loadingText?: string;
  leftIcon?: ReactNode;
  rightIcon?: ReactNode;
}

const sizeClasses: Record<ButtonSize, string> = {
  sm: "h-7 px-3 text-xs",
  default: "h-9 px-4 text-sm",
  lg: "h-11 px-6 text-base font-semibold",
};

function variantClasses(variant: ButtonVariant, onDark: boolean): string {
  if (variant === "primary") {
    // Gradient fill (brand blue -> vivid blue -> cyan) instead of a flat
    // bg-color, so hover can't rely on a second bg-color swap — a filter
    // brightness dip reads correctly across a gradient without needing a
    // second gradient token.
    return "bg-[image:var(--gradient-brand-primary)] text-white shadow-[var(--shadow-sm)] hover:shadow-[var(--shadow-md)] hover:brightness-[0.92] focus-visible:ring-[var(--color-brand-blue-accent)] focus-visible:ring-offset-[var(--color-brand-surface)]";
  }
  if (variant === "secondary") {
    return "bg-[var(--color-brand-blue-accent)]/10 text-[var(--color-brand-blue-accent)] hover:bg-[var(--color-brand-blue-accent)]/15 focus-visible:ring-[var(--color-brand-blue-accent)] focus-visible:ring-offset-[var(--color-brand-surface)]";
  }
  // ghost
  if (onDark) {
    return "border border-white/30 text-white/90 hover:bg-white/10 focus-visible:ring-white focus-visible:ring-offset-[var(--color-brand-blue)]";
  }
  return "bg-transparent text-[var(--color-brand-blue-accent)] hover:bg-[var(--color-brand-blue-light)] focus-visible:ring-[var(--color-brand-blue-accent)] focus-visible:ring-offset-[var(--color-brand-surface)]";
}

export function Button({
  variant = "primary",
  size = "default",
  onDark = false,
  loading = false,
  loadingText,
  leftIcon,
  rightIcon,
  disabled,
  className = "",
  children,
  ...props
}: ButtonProps) {
  return (
    <button
      disabled={disabled || loading}
      className={`inline-flex items-center justify-center gap-2 rounded-[var(--radius-md)] font-medium transition-all duration-150 cursor-pointer disabled:cursor-not-allowed disabled:opacity-50 disabled:shadow-none disabled:brightness-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 ${sizeClasses[size]} ${variantClasses(variant, onDark)} ${className}`}
      {...props}
    >
      {!loading && leftIcon}
      {loading ? loadingText ?? children : children}
      {!loading && rightIcon}
    </button>
  );
}
