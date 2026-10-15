import Papa from "papaparse";
import type { ImportEntry } from "../types";
import type { ImportInput, MovieProvider } from "./types";

const SOURCE = "IMDb";
type Row = Record<string, string>;

/** Only feature-length titles; skip series, episodes, games... */
const isMovie = (type: string | undefined) => !type || /^(movie|tv ?movie|video|short)$/i.test(type.trim());
const num = (v?: string) => {
  const n = v ? Number(v) : NaN;
  return Number.isFinite(n) && n > 0 ? n : null;
};

export type ImdbKind = "ratings" | "watchlist";

/**
 * Parse an IMDb CSV export. Two kinds exist:
 *  - ratings.csv     -> Watched, rating 1-10 mapped to 0.5-5, watched date = date rated
 *  - watchlist/list  -> Watchlist (list exports can carry "Your Rating" columns too, so they are told apart by Position/Created)
 * `kind` is what the user said the file is; without it the kind is guessed from the columns.
 */
export function parseImdbCsv(text: string, kind?: ImdbKind): ImportEntry[] {
  const { data, meta } = Papa.parse<Row>(text.replace(/^﻿/, ""), { header: true, skipEmptyLines: true });
  const cols = meta.fields ?? [];
  if (!cols.includes("Const") || !cols.includes("Title")) {
    throw new Error("This doesn't look like an IMDb export (expected Const and Title columns)");
  }
  const isList = cols.includes("Position") || cols.includes("Created");
  const rated = (kind ? kind === "ratings" : !isList) && cols.includes("Your Rating");
  if (kind === "ratings" && !rated) throw new Error("This is not a ratings export (no Your Rating column). Use the Watchlist upload for lists.");
  return data
    .filter((row) => row.Const && row.Title && isMovie(row["Title Type"]))
    .map((row) => {
      const rating = rated ? num(row["Your Rating"]) : null;
      return {
        title: row.Title,
        year: num(row.Year),
        imdbId: row.Const,
        status: rated ? "Watched" : "Watchlist",
        rating: rating ? Math.round(rating) / 2 : null,
        watchedDate: rated ? row["Date Rated"] || null : null, // IMDb only records when you rated it
        source: SOURCE,
      } satisfies ImportEntry;
    });
}

export const imdbProvider: MovieProvider = {
  id: "imdb",
  label: "IMDb export (CSV)",
  configured: () => true, // file upload only
  async import(input: ImportInput) {
    if (input.kind !== "file") throw new Error("IMDb has no account sync: upload ratings.csv or a watchlist export");
    const kind = input.hint === "ratings" || input.hint === "watchlist" ? input.hint : undefined;
    return parseImdbCsv(new TextDecoder("utf-8").decode(input.data), kind);
  },
};
