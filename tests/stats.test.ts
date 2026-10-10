import { describe, expect, it } from "vitest";
import { computeStats } from "@/lib/stats";
import { movieToProperties, pageToMovie } from "@/lib/notion/mapper";
import { emptyMovie } from "@/lib/types";

describe("computeStats", () => {
  it("counts watched, decades and rating buckets", () => {
    const s = computeStats([
      { ...emptyMovie("A"), year: 1995, status: "Watched", watchedDate: "2024-01-02", letterboxdRating: 4, runtime: 120, genres: ["Crime"] },
      { ...emptyMovie("B"), year: 1999, status: "Watchlist", genres: ["Crime", "Drama"] },
    ]);
    expect(s).toMatchObject({ total: 2, watched: 1, watchlist: 1, averageRating: 4, totalRuntimeHours: 2 });
    expect(s.byDecade).toEqual([{ label: "1990s", count: 2 }]);
    expect(s.genres[0]).toEqual({ label: "Crime", count: 2 });
    expect(s.ratings.find((r) => r.label === "4")?.count).toBe(1);
  });
});

describe("notion mapper", () => {
  it("round-trips only the fields present in a patch", () => {
    const props = movieToProperties({ genres: ["Drama, Crime", "Drama, Crime"], runtime: 100, status: "Watched" }, "Movie");
    expect(props["Genres"].multi_select).toEqual([{ name: "Drama  Crime" }]);
    expect(props["Runtime"]).toEqual({ number: 100 });
    expect(props["Status"]).toEqual({ status: { name: "Watched" } });
    expect(props["Year"]).toBeUndefined();
  });

  it("reads legacy rows with missing or empty columns", () => {
    const movie = pageToMovie(
      { id: "p", properties: { Movie: { title: [{ plain_text: "Heat" }] }, Year: { number: 1995 }, Genres: { multi_select: [{ name: "Crime" }] } } },
      "Movie",
    );
    expect(movie).toMatchObject({ pageId: "p", title: "Heat", year: 1995, genres: ["Crime"], directors: [], poster: null });
  });
});

describe("notion status property", () => {
  it("reads your status options", () => {
    const read = (name: string) => pageToMovie({ id: "p", properties: { Movie: { title: [] }, Status: { status: { name } } } }, "Movie").status;
    expect(read("Watched")).toBe("Watched");
    expect(read("I recommend")).toBe("Watched");
    expect(read("Want to Watch")).toBe("Watchlist");
    expect(read("Not Started")).toBeNull();
  });

  it("writes the right option for a status column, and select for a select column", () => {
    expect(movieToProperties({ status: "Watchlist" }, "Movie", { Status: "status" }).Status).toEqual({ status: { name: "Want to Watch" } });
    expect(movieToProperties({ status: "Watched" }, "Movie", { Status: "select" }).Status).toEqual({ select: { name: "Watched" } });
  });

  it("uses the Director(s) column", () => {
    expect(movieToProperties({ directors: ["Michael Mann"] }, "Movie")["Director(s)"]).toEqual({ multi_select: [{ name: "Michael Mann" }] });
  });
});
