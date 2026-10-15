import { describe, expect, it } from "vitest";
import { MovieIndex, normTitle } from "@/lib/sync/match";
import { patchForEntry } from "@/lib/sync/importEntries";
import { emptyMovie, type Movie } from "@/lib/types";

const movie = (over: Partial<Movie>): Movie => ({ ...emptyMovie("X"), ...over });

describe("MovieIndex", () => {
  const heat = movie({ title: "Heat", year: 1995, tmdbId: 949, pageId: "1" });
  const heat2 = movie({ title: "Heat", year: 1986, pageId: "2" });
  const idx = new MovieIndex([heat, heat2, movie({ title: "Amélie", year: 2001, pageId: "3" })]);

  it("prefers ids, then title+year", () => {
    expect(idx.find({ title: "?", tmdbId: 949 })?.pageId).toBe("1");
    expect(idx.find({ title: "Heat", year: 1986 })?.pageId).toBe("2");
  });
  it("ignores accents/punctuation", () => {
    expect(normTitle("Amélie!")).toBe("amelie");
    expect(idx.find({ title: "amelie", year: 2001 })?.pageId).toBe("3");
  });
  it("refuses ambiguous title-only matches", () => {
    expect(idx.find({ title: "Heat" })).toBeUndefined();
  });
});

describe("patchForEntry", () => {
  const entry = { title: "Heat", status: "Watched" as const, rating: 4, watchedDate: "2024-05-01", source: "Letterboxd" };
  it("marks watched and keeps the latest date", () => {
    expect(patchForEntry(movie({ watchedDate: "2025-01-01" }), entry)).toMatchObject({ status: "Watched", letterboxdRating: 4 });
    expect(patchForEntry(movie({ watchedDate: "2025-01-01" }), entry).watchedDate).toBeUndefined();
  });
  it("never downgrades Watched to Watchlist", () => {
    expect(patchForEntry(movie({ status: "Watched" }), { ...entry, status: "Watchlist" })).toEqual({});
  });
  it("is idempotent", () => {
    const m = movie({ status: "Watched", watchedDate: "2024-05-01", letterboxdRating: 4, myRating: 4, source: "Letterboxd" });
    expect(patchForEntry(m, entry)).toEqual({});
  });
});
