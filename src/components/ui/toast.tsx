import { type ReactElement } from "react";
import { CheckIcon, AlertIcon, InfoIcon } from "@/components/ui/icons";

export type ToastKind = "success" | "error" | "info";

export interface ToastItem {
  id: number;
  kind: ToastKind;
  message: string;
}

const kindStyles: Record<ToastKind, { icon: (props: { className?: string }) => ReactElement; classes: string }> = {
  success: {
    icon: CheckIcon,
    classes: "border-[var(--color-brand-green)]/30 text-[var(--color-brand-green)]",
  },
  error: {
    icon: AlertIcon,
    classes: "border-[var(--color-brand-red)]/30 text-[var(--color-brand-red)]",
  },
  info: {
    icon: InfoIcon,
    classes: "border-[var(--color-brand-blue-accent)]/30 text-[var(--color-brand-blue-accent)]",
  },
};

export function Toast({ kind, message }: { kind: ToastKind; message: string }) {
  const { icon: Icon, classes } = kindStyles[kind];
  return (
    <div
      role="status"
      className={`animate-toast-slide-in flex items-center gap-2 rounded-[var(--radius-md)] border bg-[var(--color-brand-surface)] px-4 py-3 text-sm font-medium shadow-[var(--shadow-lg)] ${classes}`}
    >
      <Icon className="h-4 w-4 shrink-0" />
      <span className="text-[var(--color-foreground)]">{message}</span>
    </div>
  );
}
