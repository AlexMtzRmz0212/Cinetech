import { fetchRetry } from "../http";
import { optional } from "../env";
import type { MovieMetadata } from "../types";
import type { MovieProvider } from "./types";

/** IMDb rating via OMDb, replacing the old `imdb` scraper (which breaks whenever IMDb changes). */
export const omdbProvider: MovieProvider = {
  id: "omdb",
  label: "OMDb (IMDb rating)",
  configured: () => Boolean(optional("OMDB_API_KEY")),
  async enrich(movie): Promise<MovieMetadata | null> {
    if (!movie.imdbId) return null;
    const url = `https://www.omdbapi.com/?i=${encodeURIComponent(movie.imdbId)}&apikey=${optional("OMDB_API_KEY")}`;
    const res = await fetchRetry(url);
    if (!res.ok) return null;
    const data = (await res.json()) as { Response?: string; imdbRating?: string };
    if (data.Response === "False") return null;
    const rating = Number(data.imdbRating);
    return Number.isFinite(rating) && rating > 0 ? { imdbRating: rating } : null;
  },
};
