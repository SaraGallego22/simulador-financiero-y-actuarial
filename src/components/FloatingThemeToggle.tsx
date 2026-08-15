import { ThemeToggle } from "@/components/ThemeToggle";

/**
 * Pinned to the viewport's top-right corner (not the sidebar — see
 * SidebarShell's doc comment) so it's reachable from anywhere without
 * hunting through the nav panel. A small glass chip gives it a readable
 * backdrop over the ambient SVG background and any content scrolling
 * beneath it, in either theme.
 */
export function FloatingThemeToggle() {
  return (
    <div className="fixed right-4 top-4 z-50 rounded-full border border-[var(--color-brand-gray-light)] bg-[var(--brand-glass-surface)] shadow-[var(--shadow-md)] backdrop-blur-md print:hidden">
      <ThemeToggle />
    </div>
  );
}
