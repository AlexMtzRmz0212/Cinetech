import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Movie } from "@/lib/types";

// Notion and TMDb are faked: the library starts empty and every create gets a new page id.
const notion = vi.hoisted(() => ({ library: [] as Movie[], created: [] as Movie[] }));

vi.mock("@/lib/notion/movies", () => ({
  listAllMovies: async () => notion.library,
  createMovie: async (m: Movie) => {
    const created = { ...m, pageId: `p${notion.created.length + 1}` };
    notion.created.push(created);
    return created;
  },
  updateMovie: async () => {},
}));
vi.mock("@/lib/providers/tmdb", () => ({
  tmdbProvider: { configured: () => true },
  resolveTmdbIdStrict: async (m: Movie) => (m.title === "Heat" ? 949 : null),
}));
vi.mock("@/lib/sync/enrich", () => ({
  enrichMovie: async (m: Movie) => ({ found: true, patch: { tmdbId: m.tmdbId, imdbId: m.tmdbId === 949 ? "tt0113277" : null }, changed: [] }),
}));

const { importEntries } = await import("@/lib/sync/importEntries");

const entry = (title: string, source = "Letterboxd") => ({ title, year: 1995, status: "Watched" as const, rating: 4, source });

describe("importEntries", () => {
  beforeEach(() => {
    notion.library = [];
    notion.created = [];
  });

  it("does not create a film twice across batches, even before Notion lists it", async () => {
    const first = await importEntries([entry("Heat")]);
    expect(first.outcomes[0].action).toBe("created");
    // The second batch runs against a library listing that doesn't have the new page yet.
    const second = await importEntries([{ ...entry("Heat", "IMDb"), title: "Heat (1995)", imdbId: "tt0113277" }], first.touched);
    expect(second.outcomes[0].action).toBe("updated");
    expect(notion.created).toHaveLength(1);
  });

  it("without `recent` the stale listing would have duplicated it", async () => {
    await importEntries([entry("Heat")]);
    await importEntries([{ ...entry("Heat"), title: "Heat (1995)" }]);
    expect(notion.created).toHaveLength(2);
  });

  it("creates a bare row, flagged, when no TMDb match is certain", async () => {
    const { outcomes } = await importEntries([entry("Some Obscure Film")]);
    expect(outcomes[0]).toMatchObject({ action: "created", detail: expect.stringMatching(/no confident TMDb match/) });
    expect(notion.created[0].tmdbId).toBeNull();
  });
});
