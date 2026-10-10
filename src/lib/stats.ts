import { userRating, type PublicMovie as Movie } from "./types";

export interface Count {
  label: string;
  count: number;
}

const tally = (values: (string | number | null | undefined)[], top?: number): Count[] => {
  const counts = new Map<string, number>();
  for (const v of values) if (v !== null && v !== undefined && v !== "") counts.set(String(v), (counts.get(String(v)) ?? 0) + 1);
  const sorted = [...counts].map(([label, count]) => ({ label, count })).sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));
  return top ? sorted.slice(0, top) : sorted;
};

export interface Stats {
  total: number;
  watched: number;
  watchlist: number;
  averageRating: number | null;
  totalRuntimeHours: number;
  byDecade: Count[];
  byYearWatched: Count[];
  genres: Count[];
  directors: Count[];
  actors: Count[];
  ratings: Count[]; // Letterboxd rating distribution, 0.5..5
}

/** Ratings are your own (Letterboxd, IMDb or Trakt), on a 0.5-5 scale. */
export function computeStats(movies: Movie[]): Stats {
  const watched = movies.filter((m) => m.status === "Watched");
  const rated = movies.map(userRating).filter((r): r is number => typeof r === "number");
  const buckets = Array.from({ length: 10 }, (_, i) => (i + 1) / 2);
  return {
    total: movies.length,
    watched: watched.length,
    watchlist: movies.filter((m) => m.status === "Watchlist").length,
    averageRating: rated.length ? Math.round((rated.reduce((a, b) => a + b, 0) / rated.length) * 100) / 100 : null,
    totalRuntimeHours: Math.round(watched.reduce((sum, m) => sum + (m.runtime ?? 0), 0) / 60),
    byDecade: tally(movies.map((m) => (m.year ? `${Math.floor(m.year / 10) * 10}s` : null))).sort((a, b) => a.label.localeCompare(b.label)),
    byYearWatched: tally(watched.map((m) => m.watchedDate?.slice(0, 4))).sort((a, b) => a.label.localeCompare(b.label)),
    genres: tally(movies.flatMap((m) => m.genres), 12),
    directors: tally(movies.flatMap((m) => m.directors), 10),
    actors: tally(movies.flatMap((m) => m.cast), 10),
    ratings: buckets.map((b) => ({ label: String(b), count: rated.filter((r) => r === b).length })),
  };
}
