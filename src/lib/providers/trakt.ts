import { fetchRetry } from "../http";
import { optional } from "../env";
import type { ImportEntry } from "../types";
import type { ImportInput, MovieProvider } from "./types";

const SOURCE = "Trakt";
const API = "https://api.trakt.tv";

interface TraktMovie {
  title: string;
  year: number | null;
  ids: { trakt: number; imdb?: string | null; tmdb?: number | null };
}

const ids = (m: TraktMovie) => ({ title: m.title, year: m.year, tmdbId: m.ids.tmdb ?? null, imdbId: m.ids.imdb ?? null });

/** Read every page of a public-profile list endpoint. */
async function list<T>(username: string, path: string): Promise<T[]> {
  const clientId = optional("TRAKT_CLIENT_ID");
  if (!clientId) throw new Error("Set TRAKT_CLIENT_ID (create an app at trakt.tv/oauth/applications)");
  const out: T[] = [];
  for (let page = 1, pages = 1; page <= pages; page++) {
    const res = await fetchRetry(`${API}/users/${encodeURIComponent(username)}/${path}?page=${page}&limit=1000`, {
      // Trakt's Cloudflare front rejects requests without a User-Agent (403), which Node's fetch doesn't send.
      headers: { "content-type": "application/json", "trakt-api-version": "2", "trakt-api-key": clientId, "user-agent": "Cinetech/1.0" },
    });
    if (res.status === 404) throw new Error(`Trakt user "${username}" not found`);
    if (res.status === 401) throw new Error("Trakt profile is private: make it public");
    if (res.status === 403) throw new Error("Trakt rejected the request (403): check TRAKT_CLIENT_ID, or the profile is private");
    if (!res.ok) throw new Error(`Trakt ${path} failed: ${res.status}`);
    pages = Number(res.headers.get("x-pagination-page-count")) || 1;
    out.push(...((await res.json()) as T[]));
  }
  return out;
}

/** Watched, rated and watchlisted movies of a public Trakt profile -> one entry per film. */
export function combine(
  watched: { last_watched_at?: string | null; movie: TraktMovie }[],
  ratings: { rating: number; movie: TraktMovie }[],
  watchlist: { movie: TraktMovie }[],
): ImportEntry[] {
  const byTrakt = new Map<number, ImportEntry>();
  const entry = (m: TraktMovie, status: ImportEntry["status"]) => {
    let e = byTrakt.get(m.ids.trakt);
    if (!e) byTrakt.set(m.ids.trakt, (e = { ...ids(m), status, source: SOURCE }));
    return e;
  };
  for (const w of watchlist) entry(w.movie, "Watchlist");
  for (const w of watched) {
    const e = entry(w.movie, "Watched");
    e.status = "Watched";
    e.watchedDate = w.last_watched_at?.slice(0, 10) ?? null;
  }
  for (const r of ratings) {
    const e = entry(r.movie, "Watched");
    e.status = "Watched";
    e.rating = r.rating / 2; // Trakt rates 1-10
  }
  return [...byTrakt.values()];
}

export const traktProvider: MovieProvider = {
  id: "trakt",
  label: "Trakt",
  configured: () => Boolean(optional("TRAKT_CLIENT_ID")),
  async import(input: ImportInput) {
    const username = input.kind === "account" ? input.username || optional("TRAKT_USERNAME") : undefined;
    if (!username) throw new Error("Enter your Trakt username (profile must be public)");
    const [watched, ratings, watchlist] = await Promise.all([
      list<{ last_watched_at?: string; movie: TraktMovie }>(username, "watched/movies"),
      list<{ rating: number; movie: TraktMovie }>(username, "ratings/movies"),
      list<{ movie: TraktMovie }>(username, "watchlist/movies"),
    ]);
    return combine(watched, ratings, watchlist);
  },
};
