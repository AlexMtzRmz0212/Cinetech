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

/**
 * Parse an IMDb CSV export. Two shapes exist:
 *  - ratings.csv  (has "Your Rating", "Date Rated")  -> Watched, rating 1-10 mapped to 0.5-5
 *  - watchlist / list export (no "Your Rating")      -> Watchlist
 */
export function parseImdbCsv(text: string): ImportEntry[] {
  const { data, meta } = Papa.parse<Row>(text.replace(/^﻿/, ""), { header: true, skipEmptyLines: true });
  const cols = meta.fields ?? [];
  if (!cols.includes("Const") || !cols.includes("Title")) {
    throw new Error("This doesn't look like an IMDb export (expected Const and Title columns)");
  }
  const rated = cols.includes("Your Rating");
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
    return parseImdbCsv(new TextDecoder("utf-8").decode(input.data));
  },
};
