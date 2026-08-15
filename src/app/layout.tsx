import type { Metadata } from "next";
import { Barlow, Barlow_Condensed } from "next/font/google";
import { AuthSessionProvider } from "@/components/AuthSessionProvider";
import { ToastProvider } from "@/components/ui/ToastProvider";
import { ConfirmModalHost } from "@/components/ui/confirm-modal";
import "./globals.css";

const barlow = Barlow({
  variable: "--font-barlow",
  subsets: ["latin"],
  weight: ["400", "500", "600"],
});

const barlowCondensed = Barlow_Condensed({
  variable: "--font-barlow-condensed",
  subsets: ["latin"],
  weight: ["500", "600", "700"],
});

export const metadata: Metadata = {
  title: "Simulador Financiero y Actuarial",
  description:
    "Prueba técnica de pasantía en actuaría, finanzas y riesgos para una aseguradora colombiana.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="es"
      className={`${barlow.variable} ${barlowCondensed.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <head>
        {/* Runs before paint to avoid a flash of the wrong theme — reads the
            same "theme" key ThemeToggle writes to localStorage. */}
        <script
          dangerouslySetInnerHTML={{
            __html:
              "(function(){try{var t=localStorage.getItem('theme');if(t==='dark'||(!t&&window.matchMedia('(prefers-color-scheme: dark)').matches)){document.documentElement.classList.add('dark');}}catch(e){}})();",
          }}
        />
      </head>
      {/*
        h-full + overflow-hidden (not min-h-full): pins body to exactly the
        viewport height so it never itself scrolls. Without this, tall page
        content made the whole document (sidebar included) scroll together,
        dragging the sidebar's nav/sign-out out of view — the sidebar's own
        `overflow-y-auto` on just its <nav> (see SidebarShell) only creates
        an independent, pinned-header/footer scroll region if this ancestor
        chain actually has a bounded height for it to scroll *within*.
        print:overflow-visible / print:h-auto: printed pages (Guía del
        pasante) still need to paginate content taller than one screen.
      */}
      <body className="h-full overflow-hidden flex flex-col bg-[var(--color-background)] text-[var(--color-foreground)] print:h-auto print:overflow-visible">
        <AuthSessionProvider>
          <ToastProvider>
            <ConfirmModalHost>{children}</ConfirmModalHost>
          </ToastProvider>
        </AuthSessionProvider>
      </body>
    </html>
  );
}
