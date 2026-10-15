import { fetchRetry } from "../http";
import { optional, required } from "../env";
import { normTitle } from "../sync/match";
import type { Movie, MovieMetadata, SearchResult } from "../types";
import type { MovieProvider } from "./types";

const API = "https://api.themoviedb.org/3";
const IMG = "https://image.tmdb.org/t/p/w500";

/** Accepts either the v4 "Read Access Token" (JWT) or a classic v3 API key. */
function authed(path: string, params: Record<string, string> = {}) {
  const token = required("TMDB_TOKEN");
  const url = new URL(API + path);
  const headers: Record<string, string> = { accept: "application/json" };
  if (token.length > 40) headers.Authorization = `Bearer ${token}`;
  else url.searchParams.set("api_key", token);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  return { url: url.toString(), headers };
}

async function get<T>(path: string, params?: Record<string, string>): Promise<T | null> {
  const { url, headers } = authed(path, params);
  const res = await fetchRetry(url, { headers });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`TMDb ${path} failed: ${res.status}`);
  return (await res.json()) as T;
}

interface TmdbSearch {
  results: { id: number; title: string; original_title?: string; release_date?: string; poster_path?: string | null; overview?: string }[];
}

interface TmdbDetails {
  id: number;
  title: string;
  release_date?: string;
  runtime?: number | null;
  overview?: string;
  poster_path?: string | null;
  vote_average?: number;
  vote_count?: number;
  imdb_id?: string | null;
  genres?: { name: string }[];
  spoken_languages?: { english_name: string }[];
  credits?: {
    cast?: { name: string; order?: number }[];
    crew?: { name: string; job: string }[];
  };
}

const yearOf = (date?: string) => (date ? Number(date.slice(0, 4)) || null : null);

export async function searchTmdb(query: string, year?: number | null): Promise<SearchResult[]> {
  const data = await get<TmdbSearch>("/search/movie", {
    query,
    include_adult: "false",
    ...(year ? { year: String(year) } : {}),
  });
  return (data?.results ?? []).map((r) => ({
    tmdbId: r.id,
    title: r.title,
    originalTitle: r.original_title,
    year: yearOf(r.release_date),
    poster: r.poster_path ? IMG + r.poster_path : null,
    overview: r.overview ?? "",
  }));
}

export async function tmdbIdFromImdb(imdbId: string): Promise<number | null> {
  const data = await get<{ movie_results: { id: number }[] }>(`/find/${imdbId}`, { external_source: "imdb_id" });
  return data?.movie_results[0]?.id ?? null;
}

export async function getTmdbMetadata(tmdbId: number): Promise<MovieMetadata | null> {
  const d = await get<TmdbDetails>(`/movie/${tmdbId}`, { append_to_response: "credits" });
  if (!d) return null;
  const crew = d.credits?.crew ?? [];
  const cast = [...(d.credits?.cast ?? [])].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
  return {
    title: d.title,
    tmdbId: d.id,
    imdbId: d.imdb_id || null,
    year: yearOf(d.release_date),
    releaseDate: d.release_date || null,
    runtime: d.runtime || null,
    overview: d.overview || null,
    poster: d.poster_path ? IMG + d.poster_path : null,
    tmdbRating: d.vote_count ? Math.round((d.vote_average ?? 0) * 10) / 10 : null,
    genres: (d.genres ?? []).map((g) => g.name),
    languages: (d.spoken_languages ?? []).map((l) => l.english_name),
    directors: [...new Set(crew.filter((c) => c.job === "Director").map((c) => c.name))],
    cast: cast.slice(0, 10).map((c) => c.name),
  };
}

/** Pick the TMDb id for a movie: stored id, then IMDb id, then best title/year match. */
export async function resolveTmdbId(movie: Pick<Movie, "title" | "year" | "tmdbId" | "imdbId">): Promise<number | null> {
  if (movie.tmdbId) return movie.tmdbId;
  if (movie.imdbId) {
    const id = await tmdbIdFromImdb(movie.imdbId);
    if (id) return id;
  }
  const results = await searchTmdb(movie.title, movie.year);
  if (results.length === 0 && movie.year) {
    // Year in the library may be off by one (festival vs. release): retry without it.
    return pickBest(await searchTmdb(movie.title), movie)?.tmdbId ?? null;
  }
  return pickBest(results, movie)?.tmdbId ?? null;
}

const norm = (s: string) => s.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();

function pickBest(results: SearchResult[], movie: Pick<Movie, "title" | "year">): SearchResult | undefined {
  const title = norm(movie.title);
  const exact = results.filter((r) => norm(r.title) === title);
  const pool = exact.length ? exact : results;
  if (movie.year) {
    const near = pool.find((r) => r.year !== null && Math.abs(r.year - movie.year!) <= 1);
    if (near) return near;
  }
  return pool[0];
}

/**
 * The one result that is surely this film: same title (or original title) and a year at most one off.
 * Undefined when nothing, or more than one film, fits.
 */
export function pickConfident(results: SearchResult[], movie: Pick<Movie, "title" | "year">): SearchResult | undefined {
  if (!movie.year) return undefined;
  const title = normTitle(movie.title);
  const fits = results.filter(
    (r) =>
      (normTitle(r.title) === title || (r.originalTitle && normTitle(r.originalTitle) === title)) &&
      r.year !== null &&
      Math.abs(r.year - movie.year!) <= 1,
  );
  if (fits.length <= 1) return fits[0];
  const sameYear = fits.filter((r) => r.year === movie.year);
  return sameYear.length === 1 ? sameYear[0] : undefined;
}

/** Like `resolveTmdbId`, but never guesses: imports use it so two different films can't be merged. */
export async function resolveTmdbIdStrict(movie: Pick<Movie, "title" | "year" | "tmdbId" | "imdbId">): Promise<number | null> {
  if (movie.tmdbId) return movie.tmdbId;
  if (movie.imdbId) {
    const id = await tmdbIdFromImdb(movie.imdbId);
    if (id) return id;
  }
  const hit = pickConfident(await searchTmdb(movie.title, movie.year), movie) ?? (movie.year ? pickConfident(await searchTmdb(movie.title), movie) : undefined);
  return hit?.tmdbId ?? null;
}

export const tmdbProvider: MovieProvider = {
  id: "tmdb",
  label: "TMDb",
  configured: () => Boolean(optional("TMDB_TOKEN")),
  search: searchTmdb,
  async enrich(movie) {
    const id = await resolveTmdbId(movie);
    return id ? getTmdbMetadata(id) : null;
  },
};
