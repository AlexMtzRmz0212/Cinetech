import type { Metadata, Viewport } from "next";
import { Big_Shoulders, Schibsted_Grotesk } from "next/font/google";
import Link from "next/link";
import { preconnect } from "react-dom";
import { OwnerNav } from "@/components/OwnerNav";
import "./globals.css";

export const metadata: Metadata = { title: "Cinetech", description: "Your movie library, synced with Notion" };
export const viewport: Viewport = { themeColor: "#111319", colorScheme: "dark" };

// Big Shoulders: condensed signage type for titles and figures. Schibsted Grotesk: everything else.
const display = Big_Shoulders({ subsets: ["latin", "latin-ext"], axes: ["opsz"], variable: "--font-big-shoulders" });
const sans = Schibsted_Grotesk({ subsets: ["latin", "latin-ext"], variable: "--font-schibsted" });

const links = [
  { href: "/", label: "Library" },
  { href: "/stats", label: "Stats" },
];

export default function RootLayout({ children }: { children: React.ReactNode }) {
  preconnect("https://image.tmdb.org"); // every poster comes from TMDb
  return (
    <html lang="en" className={`${display.variable} ${sans.variable}`}>
      <body className="min-h-screen">
        <a
          href="#main"
          className="sr-only focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-50 focus:rounded-md focus:bg-accent focus:px-3 focus:py-2 focus:text-sm focus:font-medium focus:text-bg"
        >
          Skip to content
        </a>
        <header className="border-b border-border bg-bg/95 backdrop-blur-sm sm:sticky sm:top-0 sm:z-40">
          <nav aria-label="Main" className="mx-auto flex max-w-7xl flex-wrap items-center gap-x-8 px-4 sm:h-16 sm:flex-nowrap sm:px-6">
            <Link href="/" className="flex h-12 items-center font-display text-[1.75rem] leading-none font-extrabold tracking-wide text-accent uppercase sm:h-auto">
              Cinetech
            </Link>
            <OwnerNav links={links} />
          </nav>
        </header>
        <main id="main" className="mx-auto max-w-7xl px-4 py-8 sm:px-6">{children}</main>
      </body>
    </html>
  );
}
