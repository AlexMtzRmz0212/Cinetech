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
  const entry = (source: string) => ({ title: "Heat", status: "Watched" as const, rating: 4.5, source });
  it("keeps Letterboxd and other ratings in their own columns", () => {
    expect(patchForEntry(emptyMovie("Heat"), entry("Letterboxd"))).toMatchObject({ letterboxdRating: 4.5 });
    expect(patchForEntry(emptyMovie("Heat"), entry("IMDb"))).toMatchObject({ myRating: 4.5 });
  });
  it("shows the Letterboxd rating first, else the other one", () => {
    expect(userRating({ letterboxdRating: 3, myRating: 5 })).toBe(3);
    expect(userRating({ letterboxdRating: null, myRating: 5 })).toBe(5);
  });
});
