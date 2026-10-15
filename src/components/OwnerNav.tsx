"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

/** Fired (on window) by anything that adds, removes or merges movies, so the header count updates right away. */
export const LIBRARY_CHANGED = "cinetech:library-changed";

/** Owner-only links. Visitors see just a lock icon that leads to the sign-in page. */
export function OwnerNav() {
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

  if (owner === null) return null;
  if (!owner) {
    return (
      <Link href="/login" className="ml-auto text-sm text-muted hover:text-text" title="Owner sign in" aria-label="Owner sign in">
        🔒
      </Link>
    );
  }
  return (
    <>
      <Link href="/add" className="text-sm text-muted hover:text-text">Add</Link>
      <Link href="/sync" className="text-sm text-muted hover:text-text">Sync</Link>
      {total !== null && (
        <span className="ml-auto rounded-full border border-border bg-panel px-2.5 py-0.5 text-xs text-muted" title="Movies in your library">
          <span className="font-semibold text-accent">{total}</span> movies
        </span>
      )}
      <button onClick={logout} className={`text-sm text-muted hover:text-text ${total === null ? "ml-auto" : ""}`}>Log out</button>
    </>
  );
}
