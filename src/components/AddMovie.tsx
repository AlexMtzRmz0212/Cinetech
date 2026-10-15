"use client";

import { useState } from "react";
import type { SearchResult, Status } from "@/lib/types";
import { LIBRARY_CHANGED } from "./OwnerNav";

export function AddMovie() {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [busy, setBusy] = useState<number | "search" | null>(null);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  async function search(e: React.FormEvent) {
    e.preventDefault();
    if (!query.trim()) return;
    setBusy("search");
    setMessage(null);
    const res = await fetch(`/api/search?q=${encodeURIComponent(query)}`);
    const data = await res.json();
    setBusy(null);
    if (!res.ok) return setMessage({ ok: false, text: data.error });
    setResults(data.results);
    if (data.results.length === 0) setMessage({ ok: false, text: "No results" });
  }

  async function add(tmdbId: number, status: Status) {
    setBusy(tmdbId);
    setMessage(null);
    const res = await fetch("/api/movies", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ tmdbId, status }) });
    const data = await res.json();
    setBusy(null);
    if (res.ok) window.dispatchEvent(new Event(LIBRARY_CHANGED));
    setMessage(res.ok ? { ok: true, text: `Added "${data.movie.title}" to Notion as ${status}` } : { ok: false, text: data.error });
  }

  return (
    <>
      <form onSubmit={search} className="mb-4 flex gap-2">
        <input className="input" autoFocus placeholder="Search TMDb…" value={query} onChange={(e) => setQuery(e.target.value)} />
        <button className="btn btn-primary" disabled={busy === "search"}>{busy === "search" ? "Searching…" : "Search"}</button>
      </form>
      {message && <p className={`mb-4 text-sm ${message.ok ? "text-green-400" : "text-red-400"}`}>{message.text}</p>}
      <ul className="space-y-3">
        {results.map((r) => (
          <li key={r.tmdbId} className="flex gap-3 rounded-lg border border-border bg-panel p-3">
            <div className="h-24 w-16 shrink-0 overflow-hidden rounded bg-border">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              {r.poster && <img src={r.poster} alt="" className="h-full w-full object-cover" />}
            </div>
            <div className="min-w-0 flex-1">
              <p className="font-medium">{r.title} <span className="text-muted">{r.year}</span></p>
              <p className="line-clamp-2 text-sm text-muted">{r.overview}</p>
              <div className="mt-2 flex gap-2">
                <button className="btn" disabled={busy !== null} onClick={() => add(r.tmdbId, "Watchlist")}>+ Watchlist</button>
                <button className="btn" disabled={busy !== null} onClick={() => add(r.tmdbId, "Watched")}>+ Watched</button>
              </div>
            </div>
          </li>
        ))}
      </ul>
    </>
  );
}
