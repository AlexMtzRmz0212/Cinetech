import { describe, expect, it } from "vitest";
import { parseImdbCsv } from "@/lib/providers/imdb";
import { combine } from "@/lib/providers/trakt";
import { patchForEntry } from "@/lib/sync/importEntries";
import { emptyMovie, userRating } from "@/lib/types";

describe("IMDb CSV", () => {
  const ratings =
    "Const,Your Rating,Date Rated,Title,URL,Title Type,IMDb Rating,Runtime (mins),Year,Genres\n" +
    "tt0113277,9,2023-05-14,Heat,https://x,Movie,8.3,170,1995,Crime\n" +
    "tt0903747,10,2023-06-01,Breaking Bad,https://x,TV Series,9.5,45,2008,Crime\n" +
    "tt0078748,7,2022-01-02,Alien,https://x,movie,8.5,117,1979,Horror\n";
  const watchlist = "\uFEFFPosition,Const,Created,Modified,Description,Title,URL,Title Type,Year\n1,tt0062622,2024-01-01,2024-01-01,,2001: A Space Odyssey,https://x,movie,1968\n";

  it("maps ratings to Watched with a 0.5-5 rating and skips series", () => {
    const entries = parseImdbCsv(ratings);
    expect(entries.map((e) => e.title)).toEqual(["Heat", "Alien"]);
    expect(entries[0]).toMatchObject({ imdbId: "tt0113277", year: 1995, status: "Watched", rating: 4.5, watchedDate: "2023-05-14", source: "IMDb" });
    expect(entries[1].rating).toBe(3.5);
  });

  it("maps a watchlist export (with BOM) to Watchlist", () => {
    expect(parseImdbCsv(watchlist)[0]).toMatchObject({ title: "2001: A Space Odyssey", status: "Watchlist", rating: null, watchedDate: null });
  });

  it("keeps a list export Watchlist even when it carries Your Rating columns", () => {
    const list =
      "Position,Const,Created,Modified,Description,Title,URL,Title Type,Year,Your Rating,Date Rated\n" +
      "1,tt0113277,2024-01-01,2024-01-01,,Heat,https://x,movie,1995,9,2023-05-14\n";
    expect(parseImdbCsv(list)[0]).toMatchObject({ status: "Watchlist", rating: null, watchedDate: null });
    expect(parseImdbCsv(list, "watchlist")[0]).toMatchObject({ status: "Watchlist", rating: null, watchedDate: null });
  });

  it("follows the chosen kind and refuses a non-ratings file as ratings", () => {
    expect(parseImdbCsv(ratings, "watchlist")[0]).toMatchObject({ status: "Watchlist", rating: null });
    expect(() => parseImdbCsv(watchlist, "ratings")).toThrow(/not a ratings export/);
  });

  it("rejects other CSVs", () => {
    expect(() => parseImdbCsv("a,b\n1,2\n")).toThrow(/IMDb export/);
  });
});

describe("Trakt", () => {
  const heat = { title: "Heat", year: 1995, ids: { trakt: 1, imdb: "tt0113277", tmdb: 949 } };
  const alien = { title: "Alien", year: 1979, ids: { trakt: 2, imdb: "tt0078748", tmdb: 348 } };
  const dune = { title: "Dune", year: 2021, ids: { trakt: 3, tmdb: 438631 } };

  it("merges watched, ratings and watchlist into one entry per film", () => {
    const entries = combine(
      [{ last_watched_at: "2024-03-01T20:00:00.000Z", movie: heat }],
      [{ rating: 9, movie: heat }, { rating: 7, movie: alien }],
      [{ movie: dune }, { movie: alien }],
    );
    expect(entries).toHaveLength(3);
    expect(entries.find((e) => e.title === "Heat")).toMatchObject({ status: "Watched", rating: 4.5, watchedDate: "2024-03-01", tmdbId: 949 });
    expect(entries.find((e) => e.title === "Alien")).toMatchObject({ status: "Watched", rating: 3.5 });
    expect(entries.find((e) => e.title === "Dune")).toMatchObject({ status: "Watchlist", imdbId: null });
  });
});

describe("ratings from different sources", () => {
  const entry = (source: string, rating = 4.5) => ({ title: "Heat", status: "Watched" as const, rating, source });
  it("keeps each tracker's rating in its own column", () => {
    expect(patchForEntry(emptyMovie("Heat"), entry("Letterboxd"))).toMatchObject({ letterboxdRating: 4.5 });
    expect(patchForEntry(emptyMovie("Heat"), entry("IMDb"))).toMatchObject({ imdbMyRating: 4.5 });
    expect(patchForEntry(emptyMovie("Heat"), entry("Trakt"))).toMatchObject({ traktRating: 4.5 });
    expect(patchForEntry(emptyMovie("Heat"), entry("TMDb"))).toMatchObject({ tmdbMyRating: 4.5 });
  });
  it("IMDb and Trakt no longer overwrite each other", () => {
    const heat = { ...emptyMovie("Heat"), status: "Watched" as const, imdbMyRating: 4.5, myRating: 4.5, source: "IMDb" };
    const patch = patchForEntry(heat, entry("Trakt", 3));
    expect(patch).toEqual({ traktRating: 3 });
  });
  it("fills My Rating only when it is empty", () => {
    expect(patchForEntry(emptyMovie("Heat"), entry("Trakt", 3)).myRating).toBe(3);
    expect(patchForEntry({ ...emptyMovie("Heat"), myRating: 5 }, entry("Trakt", 3)).myRating).toBeUndefined();
  });
  it("shows My Rating first, else the first tracker rating", () => {
    expect(userRating({ letterboxdRating: 3, myRating: 5 })).toBe(5);
    expect(userRating({ letterboxdRating: 3, myRating: null })).toBe(3);
    expect(userRating({ traktRating: 2 })).toBe(2);
    expect(userRating({})).toBeNull();
  });
});
