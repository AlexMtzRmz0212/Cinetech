import type { ImportEntry, Movie } from "../types";

export const normTitle = (s: string) =>
  s
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/&/g, " and ")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();

/** Lookup structure over the Notion library: by TMDb id, IMDb id, and normalised title(+year). */
export class MovieIndex {
  private byTmdb = new Map<number, Movie>();
  private byImdb = new Map<string, Movie>();
  private byTitle = new Map<string, Movie[]>();

  constructor(movies: Movie[] = []) {
    movies.forEach((m) => this.add(m));
  }

  add(movie: Movie) {
    if (movie.tmdbId) this.byTmdb.set(movie.tmdbId, movie);
    if (movie.imdbId) this.byImdb.set(movie.imdbId, movie);
    const key = normTitle(movie.title);
    this.byTitle.set(key, [...(this.byTitle.get(key) ?? []), movie]);
  }

  find(entry: Pick<ImportEntry, "title" | "year" | "tmdbId" | "imdbId">): Movie | undefined {
    if (entry.tmdbId && this.byTmdb.has(entry.tmdbId)) return this.byTmdb.get(entry.tmdbId);
    if (entry.imdbId && this.byImdb.has(entry.imdbId)) return this.byImdb.get(entry.imdbId);
    const candidates = this.byTitle.get(normTitle(entry.title)) ?? [];
    if (candidates.length === 0) return undefined;
    if (entry.year) {
      return (
        candidates.find((m) => m.year === entry.year) ??
        // Library rows without a year can still match by title alone.
        candidates.find((m) => !m.year)
      );
    }
    return candidates.length === 1 ? candidates[0] : undefined;
  }
}
