"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

/** Header link that marks the current page. */
export function NavLink({ href, children }: { href: string; children: React.ReactNode }) {
  const active = usePathname() === href;
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={`relative shrink-0 py-1 text-sm font-medium transition-colors after:absolute after:inset-x-0 after:-bottom-0.5 after:h-0.5 ${
        active ? "text-text after:bg-accent" : "text-muted hover:text-text"
      }`}
    >
      {children}
    </Link>
  );
}
