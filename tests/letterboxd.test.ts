import { describe, expect, it } from "vitest";
import { entriesFromCsvs, parseRss } from "@/lib/providers/letterboxd";

describe("letterboxd RSS", () => {
  const xml = `<rss><channel>
  <item><title>Heat, 1995 - ★★★★</title>
    <letterboxd:watchedDate>2024-05-01</letterboxd:watchedDate>
    <letterboxd:filmTitle>Heat</letterboxd:filmTitle><letterboxd:filmYear>1995</letterboxd:filmYear>
    <letterboxd:memberRating>4.0</letterboxd:memberRating><tmdb:movieId>949</tmdb:movieId></item>
  <item><title>My list</title></item>
  <item><letterboxd:filmTitle><![CDATA[Amélie & Co]]></letterboxd:filmTitle><letterboxd:filmYear>2001</letterboxd:filmYear></item>
  </channel></rss>`;

  it("parses diary items and skips non-film items", () => {
    const entries = parseRss(xml);
    expect(entries).toHaveLength(2);
    expect(entries[0]).toMatchObject({ title: "Heat", year: 1995, tmdbId: 949, rating: 4, watchedDate: "2024-05-01", status: "Watched" });
    expect(entries[1]).toMatchObject({ title: "Amélie & Co", rating: null, watchedDate: null });
  });
});

describe("letterboxd export CSVs", () => {
  const head = (cols: string) => cols + "\n";
  const entries = entriesFromCsvs({
    watchlist: head("Date,Name,Year,Letterboxd URI") + "2024-01-01,Heat,1995,https://boxd.it/a\n2024-01-01,Alien,1979,https://boxd.it/b\n",
    ratings: head("Date,Name,Year,Letterboxd URI,Rating") + "2024-02-01,Heat,1995,https://boxd.it/a,4.5\n",
    diary:
      head("Date,Name,Year,Letterboxd URI,Rating,Rewatch,Tags,Watched Date") +
      "2024-02-01,Heat,1995,https://boxd.it/a,4.5,,,2023-12-24\n2024-03-01,Heat,1995,https://boxd.it/a,4.5,Yes,,2024-02-28\n",
  });

  it("merges files into one entry per film", () => {
    expect(entries).toHaveLength(2);
  });

  it("a watched/rated film overrides its stale watchlist row and keeps the latest watch date", () => {
    const heat = entries.find((e) => e.title === "Heat")!;
    expect(heat).toMatchObject({ status: "Watched", rating: 4.5, watchedDate: "2024-02-28" });
  });

  it("keeps unwatched films on the watchlist", () => {
    expect(entries.find((e) => e.title === "Alien")).toMatchObject({ status: "Watchlist" });
  });
});
