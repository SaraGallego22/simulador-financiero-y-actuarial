import type { Metadata } from "next";
import { Barlow, Barlow_Condensed } from "next/font/google";
import { AuthSessionProvider } from "@/components/AuthSessionProvider";
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
      <body className="min-h-full flex flex-col bg-[var(--color-background)] text-[var(--color-foreground)]">
        <AuthSessionProvider>{children}</AuthSessionProvider>
      </body>
    </html>
  );
}
