"use client";

import { LockSimple, SignOut } from "@phosphor-icons/react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { count } from "@/lib/format";
import { NavLink } from "./NavLink";

/** Fired (on window) by anything that adds, removes or merges movies, so the header count updates right away. */
export const LIBRARY_CHANGED = "cinetech:library-changed";

/** Header links plus the owner-only ones. Visitors see just a lock icon that leads to the sign-in page. */
export function OwnerNav({ links }: { links: { href: string; label: string }[] }) {
  const [owner, setOwner] = useState<boolean | null>(null);
  const [total, setTotal] = useState<number | null>(null);
  const pathname = usePathname();

  useEffect(() => {
    fetch("/api/me")
      .then((r) => r.json())
      .then((d) => setOwner(Boolean(d.owner)))
      .catch(() => setOwner(false));
  }, []);

  // Re-read the count on every page change, when the tab regains focus, and when a sync/import/merge announces it changed the library.
  useEffect(() => {
    if (!owner) return;
    const load = (fresh: boolean) =>
      fetch(`/api/movies/count${fresh ? "?fresh=1" : ""}`, { cache: "no-store" })
        .then((r) => (r.ok ? r.json() : null))
        .then((d) => setTotal(typeof d?.total === "number" ? d.total : null))
        .catch(() => {});
    load(false);
    const onChanged = () => load(true);
    const onFocus = () => load(true);
    window.addEventListener(LIBRARY_CHANGED, onChanged);
    window.addEventListener("focus", onFocus);
    return () => {
      window.removeEventListener(LIBRARY_CHANGED, onChanged);
      window.removeEventListener("focus", onFocus);
    };
  }, [owner, pathname]);

  async function logout() {
    await fetch("/api/logout", { method: "POST" });
    window.location.href = "/";
  }

  return (
    <>
      {/* Own row under the wordmark on phones, inline from sm up. */}
      <div className="order-last flex w-full items-center gap-6 overflow-x-auto pb-3 sm:order-none sm:w-auto sm:overflow-visible sm:pb-0">
        {links.map((l) => (
          <NavLink key={l.href} href={l.href}>{l.label}</NavLink>
        ))}
        {owner && (
          <>
            <NavLink href="/add">Add</NavLink>
            <NavLink href="/sync">Sync</NavLink>
          </>
        )}
      </div>
      <div className="ml-auto flex items-center gap-4">
        {owner === false && (
          <Link href="/login" className="-m-2 p-2 text-muted transition-colors hover:text-text" title="Owner sign in" aria-label="Owner sign in">
            <LockSimple size={18} aria-hidden />
          </Link>
        )}
        {owner && total !== null && (
          <span className="rounded-full border border-border px-2.5 py-0.5 text-xs text-muted tabular-nums" title="Movies in your library">
            <span className="font-semibold text-accent">{count(total)}</span> movies
          </span>
        )}
        {owner && (
          <button onClick={logout} className="-m-2 inline-flex cursor-pointer items-center gap-1.5 p-2 text-sm text-muted transition-colors hover:text-text" aria-label="Log out">
            <SignOut size={18} aria-hidden />
            <span className="hidden sm:inline">Log out</span>
          </button>
        )}
      </div>
    </>
  );
}
