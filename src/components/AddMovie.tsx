"use client";

import { MagnifyingGlass } from "@phosphor-icons/react";
import Link from "next/link";
import { useState } from "react";
import type { SearchResult, Status } from "@/lib/types";
import { LIBRARY_CHANGED } from "./OwnerNav";

/** `pageId` links to the movie in the library (the one just added, or the one already there). */
type Message = { ok: boolean; text: string; pageId?: string };

export function AddMovie() {
  const [query, setQuery] = useState("");
  const [year, setYear] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [searched, setSearched] = useState<string | null>(null);
  const [busy, setBusy] = useState<{ tmdbId: number; status: Status } | "search" | null>(null);
  const [message, setMessage] = useState<Message | null>(null);

  async function search(e: React.FormEvent) {
    e.preventDefault();
    if (!query.trim()) return;
    setBusy("search");
    setMessage(null);
    const params = new URLSearchParams({ q: query });
    if (/^\d{4}$/.test(year.trim())) params.set("year", year.trim());
    const res = await fetch(`/api/search?${params}`);
    const data = await res.json();
    setBusy(null);
    if (!res.ok) return setMessage({ ok: false, text: data.error });
    setResults(data.results);
    setSearched(query.trim());
  }

  async function add(tmdbId: number, status: Status) {
    setBusy({ tmdbId, status });
    setMessage(null);
    const res = await fetch("/api/movies", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ tmdbId, status }) });
    const data = await res.json();
    setBusy(null);
    if (res.ok) window.dispatchEvent(new Event(LIBRARY_CHANGED));
    setMessage(
      res.ok
        ? { ok: true, text: `Added “${data.movie.title}” to Notion as ${status}.`, pageId: data.movie.pageId }
        : { ok: false, text: data.error, pageId: res.status === 409 ? data.movie?.pageId : undefined },
    );
  }

  const adding = (r: SearchResult, status: Status) => typeof busy === "object" && busy?.tmdbId === r.tmdbId && busy.status === status;

  return (
    <>
      <form onSubmit={search} className="mb-8 grid gap-3 sm:grid-cols-[minmax(0,1fr)_7rem_auto] sm:items-end">
        <label className="block">
          <span className="label">Search TMDb</span>
          <span className="relative block">
            <MagnifyingGlass size={18} aria-hidden className="pointer-events-none absolute top-1/2 left-3.5 -translate-y-1/2 text-muted" />
            <input className="input h-12 pl-10 text-base" name="q" autoComplete="off" autoFocus placeholder="Movie title…" value={query} onChange={(e) => setQuery(e.target.value)} />
          </span>
        </label>
        <label className="block">
          <span className="label">Year</span>
          <input
            className="input h-12 text-base tabular-nums"
            name="year"
            autoComplete="off"
            inputMode="numeric"
            pattern="\d{4}"
            maxLength={4}
            placeholder="Any"
            title="Four-digit release year"
            value={year}
            onChange={(e) => setYear(e.target.value)}
          />
        </label>
        <button className="btn btn-primary h-12 px-6" disabled={busy === "search"}>{busy === "search" ? "Searching…" : "Search"}</button>
      </form>

      {message && (
        <p role="status" className={`mb-6 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm ${message.ok ? "text-ok" : "text-danger"}`}>
          {message.text}
          {message.pageId && (
            <Link href={`/?film=${message.pageId}`} className="text-text underline underline-offset-4 hover:text-accent">
              See it in your library
            </Link>
          )}
        </p>
      )}

      {searched === null && <p className="text-muted">Search by title. Add the year when a title has remakes.</p>}
      {searched !== null && results.length === 0 && (
        <p className="text-muted">No movies found for &ldquo;{searched}&rdquo;. Check the spelling or clear the year.</p>
      )}

      {results.length > 0 && (
        <ul className="divide-y divide-border border-y border-border">
          {results.map((r) => (
            <li key={r.tmdbId} className="flex gap-4 py-4">
              <span className="block aspect-[2/3] w-16 shrink-0 overflow-hidden rounded-md bg-panel sm:w-20">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                {r.poster && <img src={r.poster} alt="" width={160} height={240} loading="lazy" className="h-full w-full object-cover" />}
              </span>
              <div className="min-w-0 flex-1">
                <p className="font-medium">
                  {r.title} {r.year && <span className="text-muted tabular-nums">{r.year}</span>}
                </p>
                {r.originalTitle && r.originalTitle !== r.title && <p className="text-sm text-muted">Original title: {r.originalTitle}</p>}
                <p className="mt-1 line-clamp-2 max-w-[70ch] text-sm text-muted">{r.overview}</p>
                <div className="mt-3 flex flex-wrap gap-2">
                  <button className="btn" disabled={busy !== null} onClick={() => add(r.tmdbId, "Watchlist")}>
                    {adding(r, "Watchlist") ? "Adding…" : "Add to watchlist"}
                  </button>
                  <button className="btn" disabled={busy !== null} onClick={() => add(r.tmdbId, "Watched")}>
                    {adding(r, "Watched") ? "Adding…" : "Add as watched"}
                  </button>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
