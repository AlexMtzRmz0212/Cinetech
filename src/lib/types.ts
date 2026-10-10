export type Status = "Watched" | "Watchlist";

export interface Movie {
  pageId?: string;
  title: string;
  year?: number | null;
  tmdbId?: number | null;
  imdbId?: string | null;
  imdbRating?: number | null;
  tmdbRating?: number | null;
  letterboxdRating?: number | null;
  /** Your rating (0.5-5) from sources other than Letterboxd (IMDb, Trakt...). */
  myRating?: number | null;
  directors: string[];
  genres: string[];
  languages: string[];
  cast: string[];
  releaseDate?: string | null;
  runtime?: number | null;
  overview?: string | null;
  poster?: string | null;
  status?: Status | null;
  watchedDate?: string | null;
  source?: string | null;
  lastSynced?: string | null;
}

/** Metadata a provider can contribute; never includes user-owned fields. */
export type MovieMetadata = Partial<
  Pick<
    Movie,
    | "title"
    | "year"
    | "tmdbId"
    | "imdbId"
    | "imdbRating"
    | "tmdbRating"
    | "directors"
    | "genres"
    | "languages"
    | "cast"
    | "releaseDate"
    | "runtime"
    | "overview"
    | "poster"
  >
>;

export interface SearchResult {
  tmdbId: number;
  title: string;
  year: number | null;
  poster: string | null;
  overview: string;
}

/** One film event coming from an external service (Letterboxd, IMDb CSV, Trakt…). */
export interface ImportEntry {
  title: string;
  year?: number | null;
  tmdbId?: number | null;
  imdbId?: string | null;
  status: Status;
  rating?: number | null; // 0.5 - 5 scale
  watchedDate?: string | null; // YYYY-MM-DD
  source: string;
}

/** Your rating on a 0.5-5 scale, whichever source it came from. */
export const userRating = (m: Pick<Movie, "letterboxdRating" | "myRating">) => m.letterboxdRating ?? m.myRating ?? null;

export const emptyMovie = (title: string): Movie => ({
  title,
  directors: [],
  genres: [],
  languages: [],
  cast: [],
});
