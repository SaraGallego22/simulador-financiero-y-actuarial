import { type ComponentPropsWithoutRef } from "react";

type ButtonVariant = "primary" | "secondary" | "ghost";
type ButtonSize = "sm" | "default" | "lg";

export interface ButtonProps extends ComponentPropsWithoutRef<"button"> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  /** Use on dark (brand-blue) backgrounds, e.g. the TopBar. */
  onDark?: boolean;
  loading?: boolean;
  loadingText?: string;
}

const sizeClasses: Record<ButtonSize, string> = {
  sm: "h-7 px-3 text-xs",
  default: "h-9 px-4 text-sm",
  lg: "h-11 px-6 text-base font-semibold",
};

function variantClasses(variant: ButtonVariant, onDark: boolean): string {
  if (variant === "primary") {
    return "bg-[var(--color-brand-blue)] text-white hover:bg-[var(--color-brand-blue-dark)] focus-visible:ring-[var(--color-brand-blue)] focus-visible:ring-offset-white";
  }
  if (variant === "secondary") {
    return "bg-transparent text-[var(--color-brand-blue)] border border-[var(--color-brand-blue)] hover:bg-[var(--color-brand-blue-light)] focus-visible:ring-[var(--color-brand-blue)] focus-visible:ring-offset-white";
  }
  // ghost
  if (onDark) {
    return "border border-white/30 text-white/90 hover:bg-white/10 focus-visible:ring-white focus-visible:ring-offset-[var(--color-brand-blue)]";
  }
  return "bg-transparent text-[var(--color-brand-blue)] hover:bg-[var(--color-brand-blue-light)] focus-visible:ring-[var(--color-brand-blue)] focus-visible:ring-offset-white";
}

export function Button({
  variant = "primary",
  size = "default",
  onDark = false,
  loading = false,
  loadingText,
  disabled,
  className = "",
  children,
  ...props
}: ButtonProps) {
  return (
    <button
      disabled={disabled || loading}
      className={`inline-flex items-center justify-center gap-2 rounded font-medium transition-colors duration-150 cursor-pointer disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 ${sizeClasses[size]} ${variantClasses(variant, onDark)} ${className}`}
      {...props}
    >
      {loading ? loadingText ?? children : children}
    </button>
  );
}
