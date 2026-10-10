"use client";

import { useMemo, useState } from "react";
import { userRating, type PublicMovie as Movie } from "@/lib/types";

type Sort = "title" | "year" | "watched" | "rating";

const uniq = (values: string[]) => [...new Set(values)].sort((a, b) => a.localeCompare(b));

export function LibraryView({ movies }: { movies: Movie[] }) {
  const [query, setQuery] = useState("");
  const [genre, setGenre] = useState("");
  const [director, setDirector] = useState("");
  const [status, setStatus] = useState("");
  const [minRating, setMinRating] = useState(0);
  const [sort, setSort] = useState<Sort>("watched");

  const genres = useMemo(() => uniq(movies.flatMap((m) => m.genres)), [movies]);
  const directors = useMemo(() => uniq(movies.flatMap((m) => m.directors)), [movies]);

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = movies.filter(
      (m) =>
        (!q || m.title.toLowerCase().includes(q) || m.cast.some((c) => c.toLowerCase().includes(q))) &&
        (!genre || m.genres.includes(genre)) &&
        (!director || m.directors.includes(director)) &&
        (!status || m.status === status) &&
        (!minRating || (userRating(m) ?? 0) >= minRating),
    );
    const cmp: Record<Sort, (a: Movie, b: Movie) => number> = {
      title: (a, b) => a.title.localeCompare(b.title),
      year: (a, b) => (b.year ?? 0) - (a.year ?? 0),
      watched: (a, b) => (b.watchedDate ?? "").localeCompare(a.watchedDate ?? ""),
      rating: (a, b) => (userRating(b) ?? 0) - (userRating(a) ?? 0),
    };
    return [...list].sort(cmp[sort]);
  }, [movies, query, genre, director, status, minRating, sort]);

  return (
    <>
      <div className="mb-5 grid grid-cols-2 gap-2 md:grid-cols-6">
        <input className="input col-span-2" placeholder="Search title or actor…" value={query} onChange={(e) => setQuery(e.target.value)} />
        <select className="input" value={genre} onChange={(e) => setGenre(e.target.value)}>
          <option value="">All genres</option>
          {genres.map((g) => (
            <option key={g}>{g}</option>
          ))}
        </select>
        <select className="input" value={director} onChange={(e) => setDirector(e.target.value)}>
          <option value="">All directors</option>
          {directors.map((d) => (
            <option key={d}>{d}</option>
          ))}
        </select>
        <select className="input" value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="">Any status</option>
          <option>Watched</option>
          <option>Watchlist</option>
        </select>
        <select className="input" value={sort} onChange={(e) => setSort(e.target.value as Sort)}>
          <option value="watched">Sort: recently watched</option>
          <option value="title">Sort: title</option>
          <option value="year">Sort: year</option>
          <option value="rating">Sort: my rating</option>
        </select>
        <label className="col-span-2 flex items-center gap-2 text-sm text-muted md:col-span-3">
          Min rating {minRating ? `${minRating}★` : "any"}
          <input type="range" min={0} max={5} step={0.5} value={minRating} onChange={(e) => setMinRating(Number(e.target.value))} />
        </label>
        <p className="col-span-2 self-center text-right text-sm text-muted md:col-span-3">
          {shown.length} of {movies.length} movies
        </p>
      </div>

      {movies.length === 0 && <p className="text-muted">Your library is empty. Add a movie or run a sync.</p>}

      <ul className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-5 lg:grid-cols-6">
        {shown.map((m, i) => (
          <li key={`${m.tmdbId ?? m.title}-${i}`} className="group overflow-hidden rounded-lg border border-border bg-panel">
            <div className="relative aspect-[2/3] bg-border">
              {m.poster ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={m.poster} alt={m.title} loading="lazy" className="h-full w-full object-cover" />
              ) : (
                <span className="flex h-full items-center justify-center p-2 text-center text-sm text-muted">{m.title}</span>
              )}
              {m.status === "Watchlist" && <span className="absolute left-1 top-1 rounded bg-black/70 px-1.5 py-0.5 text-[10px]">WATCHLIST</span>}
              {userRating(m) && <span className="absolute bottom-1 right-1 rounded bg-black/70 px-1.5 py-0.5 text-xs text-accent">{userRating(m)}★</span>}
            </div>
            <div className="p-2">
              <p className="truncate text-sm font-medium" title={m.title}>{m.title}</p>
              <p className="truncate text-xs text-muted">
                {[m.year, m.directors[0]].filter(Boolean).join(" · ") || "—"}
              </p>
            </div>
          </li>
        ))}
      </ul>
    </>
  );
}
