import { describe, expect, it } from "vitest";
import { findDuplicates, planMerge } from "@/lib/sync/dedupe";
import { mergeRawProperties } from "@/lib/sync/mergeRaw";
import { emptyMovie, type Movie } from "@/lib/types";

const movie = (pageId: string, over: Partial<Movie>): Movie => ({ ...emptyMovie("Heat"), pageId, ...over });

describe("findDuplicates", () => {
  it("groups by TMDb id, IMDb id, or title + year", () => {
    const groups = findDuplicates([
      movie("1", { year: 1995, tmdbId: 949 }),
      movie("2", { title: "Heat (1995)", tmdbId: 949 }),
      movie("3", { title: "HEAT", year: 1995 }),
      movie("4", { title: "Alien", imdbId: "tt0078748" }),
      movie("5", { title: "Alien (Director's cut)", imdbId: "tt0078748" }),
      movie("6", { title: "Dune", year: 2021 }),
    ]);
    expect(groups.map((g) => g.map((m) => m.pageId).sort())).toEqual([["1", "2", "3"], ["4", "5"]]);
  });

  it("never groups rows with different ids, even with the same title and year", () => {
    expect(findDuplicates([movie("1", { year: 1986, tmdbId: 1 }), movie("2", { year: 1986, tmdbId: 2 })])).toEqual([]);
    expect(findDuplicates([movie("1", { year: 1986, tmdbId: 1 }), movie("2", { year: 1986 }), movie("3", { year: 1986, tmdbId: 2 })])).toHaveLength(1);
  });
});

describe("planMerge", () => {
  it("keeps the most complete row and fills its gaps from the others", () => {
    const full = movie("full", { year: 1995, tmdbId: 949, poster: "p", overview: "o", directors: ["Michael Mann"], status: "Watchlist", statusName: "Want to Watch" });
    const watched = movie("lb", { year: 1995, status: "Watched", statusName: "I recommend", watchedDate: "2024-02-28", letterboxdRating: 4.5, source: "Letterboxd" });
    const older = movie("old", { year: 1995, status: "Watched", watchedDate: "2020-01-01", traktRating: 4 });
    const { keep, trash, patch } = planMerge([watched, full, older]);
    expect(keep.pageId).toBe("full");
    expect(trash.map((m) => m.pageId)).toEqual(["lb", "old"]);
    expect(patch).toEqual({
      letterboxdRating: 4.5,
      traktRating: 4,
      source: "Letterboxd",
      status: "Watched",
      statusName: "I recommend",
      watchedDate: "2024-02-28",
    });
  });

  it("combines what A, B and C each have alone, and unions their lists", () => {
    const a = movie("a", { year: 1995, tmdbId: 949, poster: "p", overview: "o", genres: ["Crime"] });
    const b = movie("b", { year: 1995, runtime: 170, genres: ["Drama"], cast: ["Al Pacino"] });
    const c = movie("c", { year: 1995, imdbId: "tt0113277", imdbRating: 8.3, genres: ["Crime", "Thriller"], traktRating: 4.5 });
    const { keep, patch } = planMerge([b, a, c]);
    expect(keep.pageId).toBe("a");
    expect(patch).toMatchObject({ runtime: 170, imdbId: "tt0113277", imdbRating: 8.3, traktRating: 4.5, cast: ["Al Pacino"] });
    expect([...(patch.genres ?? [])].sort()).toEqual(["Crime", "Drama", "Thriller"]);
  });
});

describe("mergeRawProperties", () => {
  const skip = new Set(["Movie"]);
  const text = (t: string) => ({ type: "rich_text", rich_text: [{ type: "text", plain_text: t, text: { content: t, link: null }, annotations: {} }] });

  it("fills empty columns, unions lists, appends notes and keeps a ticked box", () => {
    const keep = {
      Movie: { type: "title" },
      Platform: { type: "multi_select", multi_select: [{ name: "Netflix" }] },
      "Watched with": { type: "select", select: null },
      Top: { type: "select", select: { name: "Top 10" } },
      "Notes/Comments": text("Great"),
      "Not in IPTV": { type: "checkbox", checkbox: false },
      "Alex Relevance/Score": { type: "number", number: null },
    };
    const b = {
      Platform: { type: "multi_select", multi_select: [{ name: "Max" }, { name: "Netflix" }] },
      "Watched with": { type: "select", select: { name: "Mish" } },
      Top: { type: "select", select: { name: "Other" } },
      "Notes/Comments": text("Rewatch soon"),
    };
    const c = { "Not in IPTV": { type: "checkbox", checkbox: true }, "Alex Relevance/Score": { type: "number", number: 8 }, "Notes/Comments": text("Great") };
    const out = mergeRawProperties(keep, [b, c], skip);
    expect(out.Platform).toEqual({ multi_select: [{ name: "Netflix" }, { name: "Max" }] });
    expect(out["Watched with"]).toEqual({ select: { name: "Mish" } });
    expect(out.Top).toBeUndefined(); // the kept row's own value wins
    expect(out["Not in IPTV"]).toEqual({ checkbox: true });
    expect(out["Alex Relevance/Score"]).toEqual({ number: 8 });
    expect(out["Notes/Comments"].rich_text.map((t: { text: { content: string } }) => t.text.content).join("")).toBe("Great\nRewatch soon");
  });

  it("changes nothing when the others add nothing", () => {
    const keep = { Platform: { type: "multi_select", multi_select: [{ name: "Netflix" }] } };
    expect(mergeRawProperties(keep, [keep], skip)).toEqual({});
  });
});
