export type Status = "Watched" | "Watchlist";

export interface Movie {
  pageId?: string;
  title: string;
  year?: number | null;
  tmdbId?: number | null;
  imdbId?: string | null;
  imdbRating?: number | null;
  tmdbRating?: number | null;
  /** Your rating on each tracker (0.5-5). Imports keep these in step with the tracker. */
  letterboxdRating?: number | null;
  imdbMyRating?: number | null;
  traktRating?: number | null;
  tmdbMyRating?: number | null;
  /** Your master rating (0.5-5): what the site shows. Imports only fill it when empty; edit it in the app. */
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
  /** The raw Notion Status option ("I recommend", "Want to Watch"...); `status` is its Watched/Watchlist category. */
  statusName?: string | null;
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
  originalTitle?: string;
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

/** What visitors get to see: no Notion page id, source or sync bookkeeping. */
export type PublicMovie = Omit<Movie, "pageId" | "source" | "lastSynced">;

export function toPublic(movie: Movie): PublicMovie {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { pageId, source, lastSynced, ...rest } = movie;
  return rest;
}

export type RatingKey = "myRating" | "letterboxdRating" | "imdbMyRating" | "traktRating" | "tmdbMyRating";

/** Your rating on a 0.5-5 scale: the master rating, else the first tracker that has one. */
export const userRating = (m: Partial<Pick<Movie, RatingKey>>) =>
  m.myRating ?? m.letterboxdRating ?? m.imdbMyRating ?? m.traktRating ?? m.tmdbMyRating ?? null;

export const emptyMovie = (title: string): Movie => ({
  title,
  directors: [],
  genres: [],
  languages: [],
  cast: [],
});
