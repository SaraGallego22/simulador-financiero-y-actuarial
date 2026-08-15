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
    // bg-color, so hover can't rely on a second bg-color swap — brightening
    // (not dimming) on hover reads more energetic across a gradient.
    return "bg-[image:var(--gradient-brand-primary)] text-white shadow-[var(--shadow-sm)] hover:shadow-[var(--shadow-lg)] hover:brightness-110 focus-visible:ring-[var(--color-brand-blue-accent)] focus-visible:ring-offset-[var(--color-brand-surface)]";
  }
  if (variant === "secondary") {
    return "bg-[var(--color-brand-blue-accent)]/12 text-[var(--color-brand-blue-accent)] shadow-[var(--shadow-sm)] hover:bg-[var(--color-brand-blue-accent)]/20 hover:shadow-[var(--shadow-md)] focus-visible:ring-[var(--color-brand-blue-accent)] focus-visible:ring-offset-[var(--color-brand-surface)]";
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
      className={`inline-flex items-center justify-center gap-2 rounded-full font-semibold transition-all duration-150 cursor-pointer hover:-translate-y-0.5 active:translate-y-0 active:scale-[0.97] disabled:cursor-not-allowed disabled:opacity-50 disabled:shadow-none disabled:brightness-100 disabled:translate-y-0 disabled:scale-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 ${sizeClasses[size]} ${variantClasses(variant, onDark)} ${className}`}
      {...props}
    >
      {!loading && leftIcon}
      {loading ? loadingText ?? children : children}
      {!loading && rightIcon}
    </button>
  );
}
