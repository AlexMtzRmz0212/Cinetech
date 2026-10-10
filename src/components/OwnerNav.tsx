"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

/** Owner-only links. Visitors see just a lock icon that leads to the sign-in page. */
export function OwnerNav() {
  const [owner, setOwner] = useState<boolean | null>(null);

  useEffect(() => {
    fetch("/api/me")
      .then((r) => r.json())
      .then((d) => setOwner(Boolean(d.owner)))
      .catch(() => setOwner(false));
  }, []);

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
      <button onClick={logout} className="ml-auto text-sm text-muted hover:text-text">Log out</button>
    </>
  );
}
