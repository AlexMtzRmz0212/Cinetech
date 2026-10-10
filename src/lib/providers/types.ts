import type { ImportEntry, Movie, MovieMetadata, SearchResult } from "../types";

/**
 * A movie data source. Every capability is optional so a provider only
 * implements what it can do: look titles up, enrich existing movies, or
 * import the user's own watch history / ratings / watchlist.
 */
export interface MovieProvider {
  id: string;
  label: string;
  /** False when required credentials are missing, so the UI can grey it out. */
  configured(): boolean;
  search?(query: string, year?: number | null): Promise<SearchResult[]>;
  /** Returns only the fields this provider knows. */
  enrich?(movie: Movie): Promise<MovieMetadata | null>;
  /** Parse user data from an uploaded file or a remote account into normalised entries. */
  import?(input: ImportInput): Promise<ImportEntry[]>;
}

export type ImportInput =
  | { kind: "file"; name: string; data: ArrayBuffer }
  | { kind: "account"; username?: string };
