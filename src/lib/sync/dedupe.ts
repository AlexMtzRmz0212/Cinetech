import type { Movie } from "../types";
import { normTitle } from "./match";

const isEmpty = (v: unknown) => v === null || v === undefined || v === "" || (Array.isArray(v) && v.length === 0);

/** Fields that never move between rows: bookkeeping, and the title (the kept row keeps its own). */
const SKIP = new Set<keyof Movie>(["pageId", "title", "status", "statusName", "watchedDate", "lastSynced"]);

const filled = (m: Movie) => Object.entries(m).filter(([k, v]) => !SKIP.has(k as keyof Movie) && !isEmpty(v)).length;

/**
 * Rows that are the same film: same TMDb id, same IMDb id, or same title + year.
 * Rows with different TMDb or IMDb ids are never grouped, even if their titles match.
 */
export function findDuplicates(movies: Movie[]): Movie[][] {
  const parent = movies.map((_, i) => i);
  const ids = movies.map((m) => ({ tmdb: m.tmdbId ?? null, imdb: m.imdbId ?? null }));
  const root = (i: number): number => (parent[i] === i ? i : (parent[i] = root(parent[i])));
  const union = (a: number, b: number) => {
    const [ra, rb] = [root(a), root(b)];
    if (ra === rb) return;
    const [x, y] = [ids[ra], ids[rb]];
    if ((x.tmdb && y.tmdb && x.tmdb !== y.tmdb) || (x.imdb && y.imdb && x.imdb !== y.imdb)) return;
    parent[rb] = ra;
    ids[ra] = { tmdb: x.tmdb ?? y.tmdb, imdb: x.imdb ?? y.imdb };
  };

  const keyFns: ((m: Movie) => string | null)[] = [
    (m) => (m.tmdbId ? `t${m.tmdbId}` : null),
    (m) => (m.imdbId ? `i${m.imdbId}` : null),
    (m) => (m.year && normTitle(m.title) ? `n${normTitle(m.title)}|${m.year}` : null),
  ];
  for (const keyOf of keyFns) {
    const first = new Map<string, number>();
    movies.forEach((m, i) => {
      const key = keyOf(m);
      if (!key) return;
      if (first.has(key)) union(first.get(key)!, i);
      else first.set(key, i);
    });
  }

  const groups = new Map<number, Movie[]>();
  movies.forEach((m, i) => groups.set(root(i), [...(groups.get(root(i)) ?? []), m]));
  return [...groups.values()].filter((g) => g.length > 1);
}

export interface MergePlan {
  keep: Movie;
  trash: Movie[];
  patch: Partial<Movie>;
}

/**
 * Keep the most complete row and fill its empty fields from the others.
 * Watched beats Watchlist and the latest watched date wins.
 */
export function planMerge(group: Movie[]): MergePlan {
  const [keep, ...trash] = [...group].sort((a, b) => filled(b) - filled(a));
  const patch: Partial<Movie> = {};
  const set = <K extends keyof Movie>(key: K, value: Movie[K]) => {
    (patch as Record<string, unknown>)[key] = value;
  };

  for (const other of trash) {
    for (const [key, value] of Object.entries(other) as [keyof Movie, unknown][]) {
      if (SKIP.has(key) || isEmpty(value)) continue;
      if (Array.isArray(value)) {
        // Lists (directors, genres, cast, …) are combined, not just filled.
        const have = ((key in patch ? patch[key] : keep[key]) ?? []) as string[];
        const merged = [...new Set([...have, ...(value as string[])])];
        if (merged.length > have.length) set(key, merged as never);
      } else if (isEmpty(keep[key]) && !(key in patch)) set(key, value as never);
    }
  }

  const watched = group.find((m) => m.status === "Watched");
  if (keep.status !== "Watched" && watched) {
    set("status", "Watched");
    if (watched.statusName) set("statusName", watched.statusName);
  } else if (!keep.statusName) {
    const named = trash.find((m) => m.statusName);
    if (named) set("statusName", named.statusName);
  }

  const latestDate = group.map((m) => m.watchedDate).filter(Boolean).sort().at(-1);
  if (latestDate && latestDate !== keep.watchedDate) set("watchedDate", latestDate);

  return { keep, trash, patch };
}
