"use client";

import { MagnifyingGlass } from "@phosphor-icons/react";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { count } from "@/lib/format";
import { userRating, type Movie as FullMovie, type PublicMovie } from "@/lib/types";
import { FilmSheet } from "./FilmSheet";

/** Visitors get public movies; the owner gets full ones (with a Notion page id) and can edit them. */
type Movie = PublicMovie & { pageId?: string };

type Sort = "title" | "year" | "rating";

const uniq = (values: string[]) => [...new Set(values)].sort((a, b) => a.localeCompare(b));

/** The two status categories; any other name in Notion's Status column is a custom status. */
const CATEGORIES = ["Watched", "Watchlist"];

export function LibraryView({ movies: initial }: { movies: PublicMovie[] }) {
  const [movies, setMovies] = useState<Movie[]>(initial);
  const [statusOptions, setStatusOptions] = useState<string[] | null>(null); // non-null = owner mode
  const [open, setOpen] = useState<Movie | null>(null);
  const [query, setQuery] = useState("");
  const [genre, setGenre] = useState("");
  const [director, setDirector] = useState("");
  const [status, setStatus] = useState(""); // "cat:<category>" or "name:<Notion status>"
  const [minRating, setMinRating] = useState(0);
  const [sort, setSort] = useState<Sort>("year");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const me = await fetch("/api/me").then((r) => r.json()).catch(() => ({ owner: false }));
      if (!me.owner) return;
      const res = await fetch("/api/movies", { cache: "no-store" });
      if (!res.ok || cancelled) return;
      const data = (await res.json()) as { movies: FullMovie[]; statusOptions: string[] };
      setMovies(data.movies);
      setStatusOptions(data.statusOptions);
      // /?film=<pageId> (linked from the Add page) opens that movie.
      const film = new URLSearchParams(window.location.search).get("film");
      const target = film ? data.movies.find((m) => m.pageId === film) : undefined;
      if (target) setOpen(target);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const genres = useMemo(() => uniq(movies.flatMap((m) => m.genres)), [movies]);
  const directors = useMemo(() => uniq(movies.flatMap((m) => m.directors)), [movies]);
  const customStatuses = useMemo(
    () => uniq(movies.map((m) => m.statusName).filter((s): s is string => Boolean(s) && !CATEGORIES.includes(s!))),
    [movies],
  );

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    const statusMatch = (m: Movie) =>
      !status || (status.startsWith("cat:") ? m.status === status.slice(4) : m.statusName === status.slice(5));
    const list = movies.filter(
      (m) =>
        (!q || m.title.toLowerCase().includes(q) || m.cast.some((c) => c.toLowerCase().includes(q))) &&
        (!genre || m.genres.includes(genre)) &&
        (!director || m.directors.includes(director)) &&
        statusMatch(m) &&
        (!minRating || (userRating(m) ?? 0) >= minRating),
    );
    const cmp: Record<Sort, (a: Movie, b: Movie) => number> = {
      title: (a, b) => a.title.localeCompare(b.title),
      year: (a, b) => (b.year ?? 0) - (a.year ?? 0),
      rating: (a, b) => (userRating(b) ?? 0) - (userRating(a) ?? 0),
    };
    return [...list].sort(cmp[sort]);
  }, [movies, query, genre, director, status, minRating, sort]);

  const filtering = Boolean(query || genre || director || status || minRating);
  const clearFilters = () => {
    setQuery("");
    setGenre("");
    setDirector("");
    setStatus("");
    setMinRating(0);
  };

  return (
    <>
      <h1 className="page-title">Library</h1>
      <div className="mb-8 space-y-3">
        <div className="grid grid-cols-2 gap-2 md:flex md:flex-wrap">
          <label className="relative col-span-2 md:min-w-64 md:flex-1">
            <span className="sr-only">Search title or actor</span>
            <MagnifyingGlass size={16} aria-hidden className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-muted" />
            <input type="search" name="q" autoComplete="off" className="input pl-9" placeholder="Search title or actor…" value={query} onChange={(e) => setQuery(e.target.value)} />
          </label>
          <select aria-label="Genre" className="input md:w-auto" value={genre} onChange={(e) => setGenre(e.target.value)}>
            <option value="">All genres</option>
            {genres.map((g) => (
              <option key={g}>{g}</option>
            ))}
          </select>
          <select aria-label="Director" className="input md:w-auto md:max-w-56" value={director} onChange={(e) => setDirector(e.target.value)}>
            <option value="">All directors</option>
            {directors.map((d) => (
              <option key={d}>{d}</option>
            ))}
          </select>
          <select aria-label="Status" className="input md:w-auto" value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="">Any status</option>
            <optgroup label="Seen or not">
              {CATEGORIES.map((c) => (
                <option key={c} value={`cat:${c}`}>{c}</option>
              ))}
            </optgroup>
            {customStatuses.length > 0 && (
              <optgroup label="Notion status">
                {customStatuses.map((s) => (
                  <option key={s} value={`name:${s}`}>{s}</option>
                ))}
              </optgroup>
            )}
          </select>
          <select aria-label="Sort" className="input md:w-auto" value={sort} onChange={(e) => setSort(e.target.value as Sort)}>
            <option value="year">Sort: newest</option>
            <option value="title">Sort: title</option>
            <option value="rating">Sort: my rating</option>
          </select>
        </div>
        <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-sm text-muted">
          <label className="flex items-center gap-3">
            <span className="w-24 tabular-nums" aria-hidden>{minRating ? `${minRating}★ and up` : "Any rating"}</span>
            <input
              type="range"
              min={0}
              max={5}
              step={0.5}
              value={minRating}
              onChange={(e) => setMinRating(Number(e.target.value))}
              aria-label="Minimum rating"
              aria-valuetext={minRating ? `${minRating} stars and up` : "Any rating"}
              className="w-36 accent-accent"
            />
          </label>
          <p className="ml-auto tabular-nums" aria-live="polite">
            {count(shown.length)} of {count(movies.length)} movies
          </p>
          {filtering && shown.length > 0 && (
            <button type="button" className="cursor-pointer text-text underline-offset-4 hover:underline" onClick={clearFilters}>
              Clear filters
            </button>
          )}
        </div>
      </div>

      {open && (
        <FilmSheet
          key={open.pageId ?? open.title}
          movie={open}
          statusOptions={statusOptions}
          onClose={() => setOpen(null)}
          onSaved={(m) => {
            setMovies((list) => list.map((x) => (x.pageId === m.pageId ? m : x)));
            setOpen(null);
          }}
          onTrashed={(pageId) => {
            setMovies((list) => list.filter((x) => x.pageId !== pageId));
            setOpen(null);
          }}
        />
      )}

      {movies.length === 0 &&
        (statusOptions ? (
          <div className="py-12">
            <p className="font-display text-3xl font-bold uppercase">Your library is empty</p>
            <p className="mt-2 text-muted">Add a movie, or run a sync to bring in your trackers.</p>
            <div className="mt-5 flex gap-2">
              <Link href="/add" className="btn btn-primary">Add a movie</Link>
              <Link href="/sync" className="btn">Open Sync</Link>
            </div>
          </div>
        ) : (
          <p className="py-12 text-muted">Nothing here yet.</p>
        ))}

      {movies.length > 0 && shown.length === 0 && (
        <div className="py-12">
          <p className="text-muted">No movies match these filters.</p>
          <button type="button" className="btn mt-4" onClick={clearFilters}>Clear filters</button>
        </div>
      )}

      <ul className="grid grid-cols-2 gap-x-4 gap-y-7 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6">
        {shown.map((m, i) => {
          const rating = userRating(m);
          const watchlist = m.status === "Watchlist";
          return (
            // Offscreen rows skip layout and paint until scrolled near (the library is 800+ posters).
            <li key={m.pageId ?? `${m.tmdbId ?? m.title}-${i}`} className="[contain-intrinsic-size:auto_22rem] [content-visibility:auto]">
              <button type="button" className="group block w-full cursor-pointer text-left" onClick={() => setOpen(m)}>
                <span
                  className={`relative block aspect-[2/3] overflow-hidden rounded-md bg-panel group-hover:brightness-110 ${
                    watchlist ? "grayscale-[.7] group-hover:grayscale-0 group-focus-visible:grayscale-0" : ""
                  }`}
                >
                  {m.poster ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={m.poster} alt="" width={300} height={450} loading={i < 12 ? "eager" : "lazy"} decoding="async" className="h-full w-full object-cover" />
                  ) : (
                    <span className="flex h-full items-center justify-center p-3 text-center font-display text-xl leading-none font-bold text-muted uppercase">
                      {m.title}
                    </span>
                  )}
                </span>
                <span className="mt-2 block truncate text-sm font-medium" title={m.title}>{m.title}</span>
                <span className="mt-0.5 flex gap-2 text-xs text-muted">
                  <span className="truncate">{[m.year, m.directors[0]].filter(Boolean).join(" · ")}</span>
                  {watchlist ? (
                    <span className="ml-auto shrink-0">Watchlist</span>
                  ) : (
                    rating && <span className="ml-auto shrink-0 text-accent tabular-nums">{rating}★</span>
                  )}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </>
  );
}

