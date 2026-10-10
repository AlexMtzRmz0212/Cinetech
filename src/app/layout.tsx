import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";

export const metadata: Metadata = { title: "Movie Hub", description: "Your movie library, synced with Notion" };

const links = [
  { href: "/", label: "Library" },
  { href: "/add", label: "Add" },
  { href: "/sync", label: "Sync" },
  { href: "/stats", label: "Stats" },
];

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen">
        <header className="border-b border-border">
          <nav className="mx-auto flex max-w-6xl items-center gap-6 px-4 py-3">
            <span className="font-semibold text-accent">Movie Hub</span>
            {links.map((l) => (
              <Link key={l.href} href={l.href} className="text-sm text-muted hover:text-text">
                {l.label}
              </Link>
            ))}
          </nav>
        </header>
        <main className="mx-auto max-w-6xl px-4 py-6">{children}</main>
      </body>
    </html>
  );
}
