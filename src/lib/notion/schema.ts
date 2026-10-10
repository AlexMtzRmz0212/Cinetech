import type { Movie } from "../types";

export type PropType = "status" | "rich_text" | "number" | "multi_select" | "select" | "date" | "url";

export interface FieldDef {
  /** Notion property name. */
  name: string;
  type: PropType;
  /** True for columns the old scripts already used; others are created on demand. */
  legacy?: boolean;
}

/**
 * Notion column for every Movie field except the title (its column name is
 * discovered at runtime because it varies: "Movie", "Name", …).
 */
export const FIELDS = {
  year: { name: "Year", type: "number", legacy: true },
  imdbId: { name: "IMDb ID", type: "rich_text", legacy: true },
  imdbRating: { name: "IMDb Rating", type: "number", legacy: true },
  directors: { name: "Director(s)", type: "multi_select", legacy: true },
  genres: { name: "Genres", type: "multi_select", legacy: true },
  languages: { name: "Languages", type: "multi_select", legacy: true },
  cast: { name: "Cast", type: "multi_select", legacy: true },
  releaseDate: { name: "Release Date", type: "date", legacy: true },
  tmdbId: { name: "TMDb ID", type: "number" },
  tmdbRating: { name: "TMDb Rating", type: "number" },
  letterboxdRating: { name: "Letterboxd Rating", type: "number" },
  myRating: { name: "My Rating", type: "number" },
  runtime: { name: "Runtime", type: "number" },
  overview: { name: "Overview", type: "rich_text" },
  poster: { name: "Poster", type: "url" },
  status: { name: "Status", type: "status" },
  watchedDate: { name: "Watched Date", type: "date" },
  source: { name: "Source", type: "select" },
  lastSynced: { name: "Last Synced", type: "date" },
} as const satisfies Record<string, FieldDef>;

export type FieldKey = keyof typeof FIELDS;

export const FIELD_KEYS = Object.keys(FIELDS) as FieldKey[];

export const MAX_MULTI_SELECT = 10;

/** Notion option names can't contain commas and are capped at 100 chars. */
export const optionName = (value: string) => value.replace(/,/g, " ").trim().slice(0, 100);

/** Fields that count as "filled" when deciding whether a movie still needs enrichment. */
export const ENRICHABLE: (keyof Movie)[] = [
  "tmdbId",
  "imdbId",
  "year",
  "directors",
  "genres",
  "languages",
  "cast",
  "releaseDate",
  "runtime",
  "overview",
  "poster",
  "tmdbRating",
];
