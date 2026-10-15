import { describe, expect, it } from "vitest";
import { pickConfident } from "@/lib/providers/tmdb";
import { combineTmdb } from "@/lib/providers/tmdbAccount";
import type { SearchResult } from "@/lib/types";

const result = (tmdbId: number, title: string, year: number | null, originalTitle?: string): SearchResult => ({
  tmdbId,
  title,
  originalTitle,
  year,
  poster: null,
  overview: "",
});

describe("pickConfident", () => {
  it("accepts the same title within a year", () => {
    expect(pickConfident([result(1, "Something Else", 1995), result(949, "Heat", 1995)], { title: "Heat", year: 1995 })?.tmdbId).toBe(949);
    expect(pickConfident([result(949, "Heat", 1996)], { title: "heat", year: 1995 })?.tmdbId).toBe(949);
  });
  it("matches the original title too", () => {
    expect(pickConfident([result(194, "Amélie", 2001, "Le Fabuleux Destin d'Amélie Poulain")], { title: "Le Fabuleux Destin d'Amelie Poulain", year: 2001 })?.tmdbId).toBe(194);
  });
  it("refuses guesses", () => {
    expect(pickConfident([result(1, "Heat Wave", 1995)], { title: "Heat", year: 1995 })).toBeUndefined();
    expect(pickConfident([result(949, "Heat", 1995)], { title: "Heat", year: null })).toBeUndefined();
    expect(pickConfident([result(949, "Heat", 1990)], { title: "Heat", year: 1995 })).toBeUndefined();
  });
  it("breaks ties by exact year, else gives up", () => {
    expect(pickConfident([result(1, "Heat", 1994), result(2, "Heat", 1995)], { title: "Heat", year: 1995 })?.tmdbId).toBe(2);
    expect(pickConfident([result(1, "Heat", 1994), result(2, "Heat", 1996)], { title: "Heat", year: 1995 })).toBeUndefined();
  });
});

describe("TMDb account", () => {
  it("turns rated movies into Watched and keeps the rest of the watchlist", () => {
    const entries = combineTmdb(
      [{ id: 949, title: "Heat", release_date: "1995-12-15", account_rating: { value: 9, created_at: "2024-03-01T10:00:00Z" } }],
      [{ id: 949, title: "Heat", release_date: "1995-12-15" }, { id: 348, title: "Alien", release_date: "1979-05-25" }],
    );
    expect(entries).toHaveLength(2);
    expect(entries.find((e) => e.tmdbId === 949)).toMatchObject({ status: "Watched", rating: 4.5, watchedDate: "2024-03-01", year: 1995, source: "TMDb" });
    expect(entries.find((e) => e.tmdbId === 348)).toMatchObject({ status: "Watchlist", year: 1979 });
  });
});
